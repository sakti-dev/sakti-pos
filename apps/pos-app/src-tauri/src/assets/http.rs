use prost::Message;
use std::time::Duration;

fn asset_headers_to_map(
    headers: &[super::asset_proto::AssetHeader],
) -> Result<reqwest::header::HeaderMap, String> {
    let mut header_map = reqwest::header::HeaderMap::new();
    for header in headers {
        let name = reqwest::header::HeaderName::from_bytes(header.name.as_bytes())
            .map_err(|error| format!("Invalid header name {}: {}", header.name, error))?;
        let value = reqwest::header::HeaderValue::from_str(&header.value)
            .map_err(|error| format!("Invalid header value for {}: {}", header.name, error))?;
        header_map.insert(name, value);
    }
    Ok(header_map)
}

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

pub(super) fn build_signed_url_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|error| format!("Failed to build signed URL client: {}", error))
}

pub(super) async fn post_protobuf<Req, Res>(
    client: &reqwest::Client,
    url: &str,
    request: &Req,
) -> Result<Res, String>
where
    Req: Message,
    Res: Message + Default,
{
    let request_body = request.encode_to_vec();
    let response = client
        .post(url)
        .header(reqwest::header::CONTENT_TYPE, "application/x-protobuf")
        .header(reqwest::header::ACCEPT, "application/x-protobuf")
        .body(request_body)
        .send()
        .await
        .map_err(|error| format!("Request to {} failed: {}", url, error))?;

    let status = response.status();
    if !status.is_success() {
        let text = response.text().await.unwrap_or_default();
        return Err(format!("Request to {} failed ({}): {}", url, status, text));
    }

    let body = response
        .bytes()
        .await
        .map_err(|error| format!("Failed to read response from {}: {}", url, error))?;
    Res::decode(body.as_ref()).map_err(|error| format!("Failed to decode response: {}", error))
}

pub(super) async fn put_bytes_to_signed_url(
    client: &reqwest::Client,
    url: &str,
    headers: &[super::asset_proto::AssetHeader],
    bytes: &[u8],
) -> Result<(), String> {
    let header_map = asset_headers_to_map(headers)?;
    let response = client
        .put(url)
        .headers(header_map)
        .body(bytes.to_vec())
        .send()
        .await
        .map_err(|error| format!("Signed upload request failed: {}", error))?;

    let status = response.status();
    if !status.is_success() {
        let text = response.text().await.unwrap_or_default();
        return Err(format!(
            "Signed upload request failed ({}): {}",
            status, text
        ));
    }

    Ok(())
}

pub(super) fn presign_response_means_already_ready(
    response: &super::asset_proto::AssetPresignUploadResponse,
) -> bool {
    response.upload_url.trim().is_empty()
}
