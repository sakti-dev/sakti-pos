use std::time::Duration;

#[allow(dead_code)]
pub(super) fn build_api_client(session_token: &str) -> Result<reqwest::Client, String> {
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert(
        reqwest::header::AUTHORIZATION,
        reqwest::header::HeaderValue::from_str(&format!("Bearer {session_token}"))
            .map_err(|error| format!("Invalid token: {}", error))?,
    );
    reqwest::Client::builder()
        .default_headers(headers)
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|error| format!("Failed to build HTTP client: {}", error))
}

#[allow(dead_code)]
pub(super) fn build_signed_url_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|error| format!("Failed to build signed URL client: {}", error))
}
