use time::{format_description::well_known::Rfc3339, OffsetDateTime};

pub fn current_time_iso_string() -> String {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string())
}

#[cfg(test)]
mod tests {
    use super::current_time_iso_string;

    #[test]
    fn current_time_iso_string_uses_rfc3339_format() {
        let value = current_time_iso_string();

        assert!(value.contains('T'));
        assert!(value.ends_with('Z'));
    }
}
