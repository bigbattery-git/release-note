CREATE TABLE IF NOT EXISTS technology_releases (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  technology ENUM('nextjs', 'nodejs', 'react') NOT NULL,
  external_id VARCHAR(64) NOT NULL,
  version VARCHAR(100) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description LONGTEXT NULL,
  source_url VARCHAR(2048) NULL,
  changelog_url VARCHAR(2048) NULL,
  released_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_technology_releases_source (technology, external_id)
);
