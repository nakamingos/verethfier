BEGIN;

DO $$
DECLARE
    duplicate_address_count INTEGER := 0;
BEGIN
    SELECT COUNT(*) INTO duplicate_address_count
    FROM (
        SELECT address
        FROM public.user_wallets
        GROUP BY address
        HAVING COUNT(*) > 1
    ) duplicate_addresses;

    IF duplicate_address_count > 0 THEN
        RAISE NOTICE 'Removing duplicate wallet ownership rows for % addresses...', duplicate_address_count;

        WITH ranked_wallets AS (
            SELECT
                id,
                ROW_NUMBER() OVER (
                    PARTITION BY address
                    ORDER BY created_at ASC, id ASC
                ) AS row_num
            FROM public.user_wallets
        )
        DELETE FROM public.user_wallets uw
        USING ranked_wallets rw
        WHERE uw.id = rw.id
          AND rw.row_num > 1;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'user_wallets_address_key'
          AND conrelid = 'public.user_wallets'::regclass
    ) THEN
        ALTER TABLE public.user_wallets
            ADD CONSTRAINT user_wallets_address_key UNIQUE (address);
    END IF;

    RAISE NOTICE 'Wallet ownership is now enforced as unique per address.';
END $$;

COMMIT;
