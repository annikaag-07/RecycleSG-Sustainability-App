
-- RecycleSG: Initial Recycling Material Categories

INSERT INTO public.material_types (name, description)
VALUES
    ('Plastic', 'Plastic bottles, containers and other accepted plastic items'),
    ('Paper', 'Newspapers, office paper and other recyclable paper'),
    ('Cardboard', 'Cardboard boxes and packaging'),
    ('Glass', 'Glass bottles and containers'),
    ('Metal', 'Aluminium cans and other accepted metal items'),
    ('Batteries', 'Household batteries accepted at designated collection points'),
    ('E-Waste', 'Electronic devices and electrical equipment'),
    ('Clothing', 'Clothes and textiles accepted for collection'),
    ('Lighting Waste', 'Used light bulbs and lighting equipment')
ON CONFLICT (name) DO NOTHING;
