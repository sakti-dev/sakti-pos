use std::fs;
use std::path::{Path, PathBuf};

#[allow(dead_code)]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MigrationFile {
    pub name: String,
    pub file_name: String,
    pub path: PathBuf,
}

#[allow(dead_code)]
pub fn collect_migration_files(dir: impl AsRef<Path>) -> Result<Vec<MigrationFile>, String> {
    let mut migrations = Vec::new();

    let entries = fs::read_dir(dir.as_ref())
        .map_err(|e| format!("Failed to read migration directory: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read migration entry: {}", e))?;
        let path = entry.path();
        if !path.is_file() || path.extension().and_then(|ext| ext.to_str()) != Some("sql") {
            continue;
        }

        let file_name = path
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or_else(|| format!("Invalid migration file name: {}", path.display()))?
            .to_owned();

        let name = path
            .file_stem()
            .and_then(|stem| stem.to_str())
            .ok_or_else(|| format!("Invalid migration file stem: {}", path.display()))?
            .to_owned();

        migrations.push(MigrationFile {
            name,
            file_name,
            path,
        });
    }

    migrations.sort_by(|left, right| left.file_name.cmp(&right.file_name));
    Ok(migrations)
}

#[cfg(test)]
mod tests {
    use super::collect_migration_files;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn collects_and_sorts_sql_files_only() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time before UNIX_EPOCH")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!(
            "sakti-pos-migration-discovery-{}-{}",
            std::process::id(),
            unique
        ));

        fs::create_dir_all(&dir).expect("failed to create temp dir");
        fs::write(dir.join("0002_second.sql"), "SELECT 2;").expect("failed to write file");
        fs::write(dir.join("README.txt"), "ignore me").expect("failed to write file");
        fs::write(dir.join("0001_first.sql"), "SELECT 1;").expect("failed to write file");

        let migrations = collect_migration_files(&dir).expect("failed to collect migrations");

        assert_eq!(
            migrations
                .iter()
                .map(|migration| migration.file_name.as_str())
                .collect::<Vec<_>>(),
            vec!["0001_first.sql", "0002_second.sql"]
        );
        assert_eq!(
            migrations
                .iter()
                .map(|migration| migration.name.as_str())
                .collect::<Vec<_>>(),
            vec!["0001_first", "0002_second"]
        );

        fs::remove_dir_all(&dir).expect("failed to clean up temp dir");
    }
}
