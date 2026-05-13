pub(crate) fn format_log_value<T: std::fmt::Debug>(value: &T) -> String {
    let raw = format!("{value:?}");
    let Some(unquoted) = raw
        .strip_prefix('"')
        .and_then(|value| value.strip_suffix('"'))
    else {
        return raw;
    };

    if unquoted
        .chars()
        .any(|character| matches!(character, ' ' | '"' | '='))
    {
        raw
    } else {
        unquoted.to_string()
    }
}

#[macro_export]
macro_rules! pos_log {
    ($level:ident, $domain:literal, $action:literal, $message:literal $(,)?) => {{
        log::$level!("[RUST] [{}:{}] {}", $domain, $action, $message);
    }};
    ($level:ident, $domain:literal, $action:literal, $message:literal, $($key:literal => $value:expr),+ $(,)?) => {{
        let mut context = String::new();
        $(
            context.push(' ');
            context.push_str($key);
            context.push('=');
            context.push_str(&$crate::logging::format_log_value(&$value));
        )+
        log::$level!("[RUST] [{}:{}] {}{}", $domain, $action, $message, context);
    }};
}
