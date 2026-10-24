
-- RecycleSG: Automatically create a profile after signup

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.profiles (
        id,
        username,
        display_name
    )
    VALUES (
        NEW.id,
        'user_' || REPLACE(NEW.id::TEXT, '-', ''),
        NULLIF(NEW.raw_user_meta_data ->> 'display_name', '')
    );

    RETURN NEW;
END;
$$;

-- Run the function whenever a user registers
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();
