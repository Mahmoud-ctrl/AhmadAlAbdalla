-- In-app notifications: stored per user, fed by DB trigger on transfer creation.

CREATE TABLE IF NOT EXISTS public.notifications (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type       text        NOT NULL,
  title      text        NOT NULL,
  body       text,
  data       jsonb,
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users select own notifications" ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "users update own notifications" ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id);

-- Enable realtime delivery for this table
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Trigger function: insert a notification for every active user assigned to
-- the receiving branch whenever a new transfer is created.
CREATE OR REPLACE FUNCTION public.notify_branch_on_transfer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender_name text;
BEGIN
  SELECT name INTO v_sender_name
  FROM public.branches
  WHERE id = NEW.sender_branch_id;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  SELECT
    up.id,
    'incoming_transfer',
    'New Incoming Transfer',
    'Transfer received from ' || COALESCE(v_sender_name, 'another branch'),
    jsonb_build_object(
      'transfer_id',      NEW.id,
      'sender_branch_id', NEW.sender_branch_id
    )
  FROM public.user_profiles up
  WHERE up.branch_id = NEW.receiver_branch_id
    AND up.active     = true;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_transfer_created
  AFTER INSERT ON public.transfers
  FOR EACH ROW EXECUTE FUNCTION public.notify_branch_on_transfer();
