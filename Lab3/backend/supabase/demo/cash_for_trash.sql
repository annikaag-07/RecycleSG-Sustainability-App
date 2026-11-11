-- ALBA W&H Cash for Trash schedule effective 1 May 2026, retrieved 11 Nov 2026.
-- The block-level pin matches NEA Recycling Bins CSV row 3665, postal code 640456.
-- The collection station and the permanent blue bin are distinct services at this address.
do $$
declare
    station_name constant text := 'ALBA Cash for Trash at Block 456';
    station_address constant text := '456 Jurong West Street 41, Singapore 640456';
begin
    perform pg_advisory_xact_lock(hashtextextended(station_name,0));
    insert into public.recycling_points(name,address,latitude,longitude,source,region,operating_hours,weekly_hours)
        select station_name,station_address,1.35067572550184,103.720022400236,
          'https://www.alba-wh.sg/pdf/Cash-For-Trash-Schedule%20%28wef%201%20May%202026%29.pdf',
          'West','Second Sunday of the month, 08:30 to 11:30',
          '[{"day":7,"week":2,"start":510,"end":690}]'::jsonb
        where not exists (
          select 1 from public.recycling_points where name=station_name and address=station_address
        );
end $$;
