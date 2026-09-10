CREATE TABLE default_technologies (
  technology VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  releases_path VARCHAR(255) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (technology),
  UNIQUE KEY uq_default_technologies_releases_path (releases_path)
);

INSERT INTO default_technologies (
  technology,
  display_name,
  releases_path,
  enabled,
  sort_order
) VALUES
  ('nextjs', 'Next.js', '/repos/vercel/next.js/releases', TRUE, 10),
  ('nodejs', 'Node.js', '/repos/nodejs/node/releases', TRUE, 20),
  ('react', 'React', '/repos/react/react/releases', TRUE, 30);

ALTER TABLE technology_releases
  MODIFY technology VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;

ALTER TABLE technology_releases
  ADD CONSTRAINT fk_technology_releases_technology
  FOREIGN KEY (technology)
  REFERENCES default_technologies (technology)
  ON UPDATE CASCADE
  ON DELETE RESTRICT;
