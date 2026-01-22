-- Create time_records table
CREATE TABLE IF NOT EXISTS time_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  stop_time TIMESTAMPTZ,
  elapsed_ms INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster queries by date
CREATE INDEX IF NOT EXISTS idx_time_records_start_time ON time_records(start_time);
CREATE INDEX IF NOT EXISTS idx_time_records_user_id ON time_records(user_id);

-- Enable Row Level Security
ALTER TABLE time_records ENABLE ROW LEVEL SECURITY;

-- Create policy to allow users to see only their own data
CREATE POLICY "Users can view their own records" ON time_records
  FOR SELECT
  USING (user_id = current_setting('app.user_id', true)::UUID);

-- Create policy to allow users to insert their own data
CREATE POLICY "Users can insert their own records" ON time_records
  FOR INSERT
  WITH CHECK (user_id = current_setting('app.user_id', true)::UUID);

-- Create policy to allow users to update their own data
CREATE POLICY "Users can update their own records" ON time_records
  FOR UPDATE
  USING (user_id = current_setting('app.user_id', true)::UUID)
  WITH CHECK (user_id = current_setting('app.user_id', true)::UUID);

-- Create policy to allow users to delete their own data
CREATE POLICY "Users can delete their own records" ON time_records
  FOR DELETE
  USING (user_id = current_setting('app.user_id', true)::UUID);

-- Create function to set user_id in session
CREATE OR REPLACE FUNCTION set_user_id(user_id UUID)
RETURNS void AS $$
BEGIN
  PERFORM set_config('app.user_id', user_id::text, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
