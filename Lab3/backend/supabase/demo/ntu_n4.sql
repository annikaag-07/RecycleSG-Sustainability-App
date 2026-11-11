-- Classroom fixture, applied explicitly to the demo project through SQL/MCP.
-- OneMap search "NANYANG N4", checked 2026-11-10. This is the N4 building pin.
-- https://www.onemap.gov.sg/api/common/elastic/search?searchVal=NANYANG%20N4&returnGeom=Y&getAddrDetails=Y&pageNum=1
BEGIN;
DO $$
DECLARE
    demo_point_id bigint;
BEGIN
    SELECT id INTO demo_point_id FROM public.recycling_points
    WHERE source = 'SC2006 classroom demo (NTU N4)';

    IF demo_point_id IS NULL THEN
        INSERT INTO public.recycling_points(name, address, latitude, longitude, status, source)
        VALUES ('Demo recycling bin — NTU N4',
                '50 Nanyang Avenue, Block N4, Singapore 639798',
                1.346176586042716, 103.6821610515534, 'Available',
                'SC2006 classroom demo (NTU N4)')
        RETURNING id INTO demo_point_id;
    END IF;

    INSERT INTO public.recycling_point_materials(recycling_point_id, material_type_id)
    SELECT demo_point_id, id FROM public.material_types
    WHERE name IN ('Plastic', 'Paper', 'Glass', 'Metal')
    ON CONFLICT DO NOTHING;
END;
$$;
COMMIT;
