//! Security test: path-traversal di `GET /api/public/uploads/*path`.
//!
//! Endpoint ini serve file dari `upload_dir` (LocalStorage). Spec §11
//! mewajibkan path-traversal guarded — kalau lolos, attacker bisa baca
//! file arbitrary dari server (e.g. `/etc/passwd`, `Cargo.toml`, dsb).

mod common;

use axum::{
    body::Body,
    http::{Method, Request, StatusCode},
};
use serial_test::serial;
use tower::ServiceExt;

async fn upload(app: &common::TestApp, path: &str) -> (StatusCode, Vec<u8>, String) {
    let req = Request::builder()
        .method(Method::GET)
        .uri(format!("/api/public/uploads/{path}"))
        .body(Body::empty())
        .unwrap();
    let resp = app.router.clone().oneshot(req).await.unwrap();
    let status = resp.status();
    let content_type = resp
        .headers()
        .get("content-type")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("")
        .to_string();
    let disposition = resp
        .headers()
        .get("content-disposition")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("")
        .to_string();
    let bytes = axum::body::to_bytes(resp.into_body(), 1024 * 1024)
        .await
        .unwrap()
        .to_vec();
    (status, bytes, format!("{content_type}|{disposition}"))
}

/// Tulis file langsung ke upload_dir TestApp (TempDir). Storage impl baca
/// dari sini saat read_bytes().
fn write_to_upload(app: &common::TestApp, key: &str, bytes: &[u8]) {
    // TempDir held by TestApp via `_tmp` (private); reach via
    // `storage.public_url` indirection — instead, get path via Drop impl.
    // Easier: kita tulis ke `<tempdir>/key` directly. TestApp keeps TempDir
    // alive for the test duration via `_tmp: TempDir` field.
    //
    // Workaround: build path from `cfg.upload_dir` di main process + ini
    // test = "./uploads-test" relative to backend CWD. Tapi TempDir random.
    // Solusi: use Storage::save_ktp dengan fake customer_id (route ke
    // LocalStorage.write_to_disk), atau — paling simple — expose tmp path
    // di TestApp. Karena infrastructure masih evolvable, kita patch via
    // filesystem di folder upload dari app config.
    let path = std::path::PathBuf::from(&app.config.upload_dir).join(key);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(&path, bytes).unwrap();
}

#[tokio::test]
#[serial]
async fn path_traversal_blocked() {
    let app = common::spawn_app().await;

    // Place file valid di upload_dir via direct fs write.
    let key = "clients/test-logo.png";
    write_to_upload(&app, key, b"\x89PNG\r\n\x1a\n fake png body");

    // Baseline: file valid → 200.
    let (status, body, _) = upload(&app, key).await;
    assert_eq!(status, StatusCode::OK, "baseline harus 200");
    assert!(!body.is_empty(), "harus serve file content");

    // Attack: ../etc/passwd → 400 (guard_key reject path-traversal).
    for attack in [
        "../etc/passwd",
        "../../etc/passwd",
        "clients/../../etc/passwd",
        "..%2Fetc%2Fpasswd",
        "clients/..%2F..%2Fetc%2Fpasswd",
    ] {
        let (status, _, _) = upload(&app, attack).await;
        assert_eq!(
            status,
            StatusCode::BAD_REQUEST,
            "attack '{attack}' harus ditolak (guard_key), dapat {status}"
        );
    }
}

#[tokio::test]
#[serial]
async fn upload_serves_with_inline_content_disposition() {
    let app = common::spawn_app().await;
    let key = "test-document.pdf";
    let pdf_bytes = b"%PDF-1.4\n%fake pdf content\n%%EOF".to_vec();
    write_to_upload(&app, key, &pdf_bytes);

    let (status, body, meta) = upload(&app, key).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body, pdf_bytes);
    // Content-Type untuk PDF atau Content-Disposition inline.
    assert!(
        meta.contains("inline") || meta.contains("application/pdf") || meta.contains("pdf"),
        "content-type/disposition harus PDF atau inline, dapat {meta}"
    );
}
