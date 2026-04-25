-- Create users table for authentication
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'user',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert the 3 user accounts
-- Passwords are stored as plain text for this demo (in production, use proper hashing)
INSERT INTO users (username, password, role) VALUES
('Reign', 'WellnActive2026', 'admin'),
('Admin', 'WellnActive2026Admin', 'admin'),
('Guest', 'WellnActive2026Guest', 'guest')
ON CONFLICT (username) DO NOTHING;