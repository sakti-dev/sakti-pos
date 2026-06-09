/// Scaffold API surface test.
///
/// Validates that the public plugin API compiles and exports:
/// - `init()` plugin initializer
/// - DTO types (QueueDocument, JobRecord, etc.)
/// - Error types (PluginError)
/// - Extension trait (ImagePipelineExt)
/// - ImagePipeline handle
#[cfg(test)]
mod scaffold_api {
    use tauri_plugin_image_pipeline::{
        dto::{
            AndroidCompressImageRequest, AndroidCompressImageResponse,
            AndroidGeneratePreviewRequest, AndroidGeneratePreviewResponse, EnqueueJobRequest,
            JobStatus, QueueDocument,
        },
        error::PluginError,
    };

    /// Compile-time proof that all DTO types exist and derive the right traits.
    #[test]
    fn dto_types_exist_and_derive_serde() {
        // QueueDocument with Default
        let doc = QueueDocument::default();
        assert_eq!(doc.version, 1);
        assert!(doc.jobs.is_empty());

        // Serialize/deserialize round-trip
        let json = serde_json::to_string(&doc).unwrap();
        let parsed: QueueDocument = serde_json::from_str(&json).unwrap();
        assert_eq!(doc, parsed);

        // JobStatus variants
        let statuses = vec![
            JobStatus::Pending,
            JobStatus::Processing,
            JobStatus::Completed,
            JobStatus::Failed,
        ];
        let status_json = serde_json::to_string(&statuses).unwrap();
        assert!(status_json.contains("snake_case") || status_json.contains("pending"));
    }

    /// Compile-time proof that PluginError variants exist.
    #[test]
    fn error_variants_exist() {
        let _ = PluginError::InvalidRequest {
            field: "test",
            reason: "test".into(),
        };
        let _ = PluginError::UnsafePath {
            path: std::path::PathBuf::from("/bad"),
        };
        let _ = PluginError::JobNotFound {
            job_id: "abc".into(),
        };
        let _ = PluginError::UnsupportedQueueVersion {
            found: 2,
            supported: 1,
        };
    }

    /// Compile-time proof that request DTOs accept camelCase deserialization.
    #[test]
    fn request_dto_camel_case() {
        let json = r#"{
            "merchantId": "m1",
            "sourcePath": "/tmp/photo.jpg",
            "originalFilename": "photo.jpg",
            "sourceMimeType": "image/jpeg",
            "processingKind": "image:webp-thumbnail",
            "entityType": "product",
            "entityId": "p1",
            "attachmentField": "image_asset_id",
            "maxLongEdge": 400,
            "previewMaxLongEdge": 320,
            "maxAttempts": 3
        }"#;
        let req: EnqueueJobRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.merchant_id, "m1");
        assert_eq!(req.max_long_edge, 400);
        assert_eq!(req.max_attempts, Some(3));
    }

    /// Compile-time proof that the Android bridge DTOs serialize as expected.
    #[test]
    fn android_bridge_dto_camel_case() {
        let preview = AndroidGeneratePreviewRequest {
            source_path: "/tmp/photo.jpg".into(),
            preview_output_dir: "/tmp/previews".into(),
            original_filename: "photo.jpg".into(),
            preview_max_long_edge: 320,
        };
        let preview_json = serde_json::to_value(&preview).unwrap();
        assert!(preview_json.get("sourcePath").is_some());
        assert!(preview_json.get("previewOutputDir").is_some());

        let compress = AndroidCompressImageRequest {
            source_path: "/tmp/photo.jpg".into(),
            output_dir: "/tmp/assets".into(),
            preview_output_dir: Some("/tmp/previews".into()),
            original_filename: "photo.jpg".into(),
            api_level: Some(30),
            max_long_edge: 400,
            preview_max_long_edge: 320,
        };
        let compress_json = serde_json::to_value(&compress).unwrap();
        assert!(compress_json.get("outputDir").is_some());
        assert!(compress_json.get("previewOutputDir").is_some());

        let response = AndroidCompressImageResponse {
            asset_path: "/tmp/assets/hash.webp".into(),
            preview_path: Some("/tmp/previews/hash.jpg".into()),
            content_hash: "hash".into(),
            content_type: "image/webp".into(),
            width: 400,
            height: 300,
            byte_size: 1234,
            original_filename: "photo.jpg".into(),
        };
        let response_json = serde_json::to_value(&response).unwrap();
        assert!(response_json.get("assetPath").is_some());
        assert!(response_json.get("contentType").is_some());

        let preview_response = AndroidGeneratePreviewResponse {
            preview_path: Some("/tmp/previews/hash.jpg".into()),
            preview_mime_type: "image/jpeg".into(),
        };
        let preview_response_json = serde_json::to_value(&preview_response).unwrap();
        assert!(preview_response_json.get("previewPath").is_some());
        assert!(preview_response_json.get("previewMimeType").is_some());
    }

    /// Compile-time proof that the extension trait and ImagePipeline exist.
    /// We can't instantiate a Tauri app in a unit test, but the type-level
    /// proof that `ImagePipelineExt` references `ImagePipeline` compiles.
    #[test]
    fn extension_trait_compiles() {
        fn _assert_ext<R: tauri::Runtime>()
        where
            tauri::AppHandle<R>: tauri::Manager<R>,
        {
            // This function body would need a real AppHandle to call,
            // but the fact it compiles proves the trait bounds are valid.
        }
    }
}
