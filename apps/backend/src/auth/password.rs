//! Argon2id password hashing (OWASP-recommended default params).

use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use rand::Rng;

use crate::error::AppError;

pub fn hash_password(plain: &str) -> Result<String, AppError> {
    let salt = SaltString::generate(&mut OsRng);
    let hash = Argon2::default()
        .hash_password(plain.as_bytes(), &salt)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("argon2 hash: {e}")))?;
    Ok(hash.to_string())
}

pub fn verify_password(plain: &str, hash: &str) -> Result<bool, AppError> {
    let parsed = PasswordHash::new(hash)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("argon2 parse: {e}")))?;
    Ok(Argon2::default()
        .verify_password(plain.as_bytes(), &parsed)
        .is_ok())
}

/// Charset untuk generate_random_password — exclude karakter yang mudah
/// tertukar (0/O, 1/l/I) supaya password lebih mudah diketik ulang atau
/// disampaikan via voice/chat. 56 chars × 16 posisi = ~85 bit entropy.
const PASSWORD_CHARSET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/// Generate password acak untuk reset/admin-create flow.
///
/// Panjang default 16 — cukup untuk entropy ~85 bit pada charset ini.
pub fn generate_random_password(len: usize) -> String {
    let mut rng = rand::thread_rng();
    (0..len)
        .map(|_| PASSWORD_CHARSET[rng.gen_range(0..PASSWORD_CHARSET.len())] as char)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip() {
        let plain = "hello123ABC";
        let hash = hash_password(plain).unwrap();
        assert!(verify_password(plain, &hash).unwrap());
        assert!(!verify_password("wrong", &hash).unwrap());
    }

    #[test]
    fn generated_password_is_random_and_correct_length() {
        let p1 = generate_random_password(16);
        let p2 = generate_random_password(16);
        assert_eq!(p1.len(), 16);
        assert_eq!(p2.len(), 16);
        // Probabilitas collision pada 16-char random 56-char alphabet
        // (~95 bit entropy) effectively 0 — test ini cukup untuk sanity
        // bahwa generator berjalan dan panjangnya benar.
        assert_ne!(p1, p2);
        // Charset: harus alphanumeric saja, tanpa karakter yang
        // kita exclude (0/O/1/l/I).
        for c in p1.chars() {
            assert!(
                PASSWORD_CHARSET.contains(&(c as u8)),
                "unexpected char: {c}"
            );
        }
    }
}
