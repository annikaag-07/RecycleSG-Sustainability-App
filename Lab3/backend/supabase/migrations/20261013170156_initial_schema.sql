
-- RecycleSG: Initial Database Schema
-- User Profiles

CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id)
        ON DELETE CASCADE,

    username TEXT NOT NULL UNIQUE,
    display_name TEXT,
    avatar_url TEXT,
    bio TEXT,

    eco_points INTEGER NOT NULL DEFAULT 0,
    available_eco_points INTEGER NOT NULL DEFAULT 0,
    xp INTEGER NOT NULL DEFAULT 0,
    level INTEGER NOT NULL DEFAULT 1,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT nonnegative_eco_points
        CHECK (eco_points >= 0),

    CONSTRAINT nonnegative_available_points
        CHECK (available_eco_points >= 0),

    CONSTRAINT nonnegative_xp
        CHECK (xp >= 0)
);

-- Enable Row Level Security
ALTER TABLE public.profiles
ENABLE ROW LEVEL SECURITY;

-- Users can view their own profile
CREATE POLICY "Users can view own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = id);


-- ============================================
-- RecycleSG: Recycling Points and Materials
-- ============================================

-- 1. Recycling locations
CREATE TABLE public.recycling_points (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT NOT NULL,

    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,

    operating_hours TEXT,
    status TEXT NOT NULL DEFAULT 'Available',

    source TEXT,
    last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_latitude
        CHECK (latitude BETWEEN -90 AND 90),

    CONSTRAINT valid_longitude
        CHECK (longitude BETWEEN -180 AND 180),

    CONSTRAINT valid_recycling_status
        CHECK (status IN (
            'Available',
            'Full',
            'Temporarily Closed',
            'Inaccessible',
            'Removed',
            'Information Outdated'
        ))
);

-- 2. Recyclable material categories
CREATE TABLE public.material_types (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT
);

-- 3. Materials accepted at each recycling point
CREATE TABLE public.recycling_point_materials (
    recycling_point_id BIGINT NOT NULL
        REFERENCES public.recycling_points(id)
        ON DELETE CASCADE,

    material_type_id BIGINT NOT NULL
        REFERENCES public.material_types(id)
        ON DELETE CASCADE,

    PRIMARY KEY (recycling_point_id, material_type_id)
);

-- Indexes for material-based searches
CREATE INDEX idx_recycling_point_materials_material
ON public.recycling_point_materials(material_type_id);

-- Enable Row Level Security
ALTER TABLE public.recycling_points
ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.material_types
ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.recycling_point_materials
ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RecycleSG: Check-ins and Recycling Activities
-- ============================================

-- 1. User check-ins at recycling points
CREATE TABLE public.check_ins (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    user_id UUID NOT NULL
        REFERENCES public.profiles(id)
        ON DELETE CASCADE,

    recycling_point_id BIGINT NOT NULL
        REFERENCES public.recycling_points(id),

    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,

    distance_meters DOUBLE PRECISION,

    checked_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_checkin_latitude
        CHECK (latitude BETWEEN -90 AND 90),

    CONSTRAINT valid_checkin_longitude
        CHECK (longitude BETWEEN -180 AND 180),

    CONSTRAINT valid_checkin_distance
        CHECK (distance_meters >= 0)
);

-- 2. Recycling activities and CV verification
CREATE TABLE public.recycling_actions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    user_id UUID NOT NULL
        REFERENCES public.profiles(id)
        ON DELETE CASCADE,

    check_in_id BIGINT NOT NULL
        REFERENCES public.check_ins(id),

    material_type_id BIGINT NOT NULL
        REFERENCES public.material_types(id),

    quantity INTEGER NOT NULL DEFAULT 1,

    photo_url TEXT,

    cv_predicted_material TEXT,
    cv_confidence DOUBLE PRECISION,

    verification_status TEXT NOT NULL DEFAULT 'Pending',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    verified_at TIMESTAMPTZ,

    CONSTRAINT valid_recycling_quantity
        CHECK (quantity > 0),

    CONSTRAINT valid_cv_confidence
        CHECK (
            cv_confidence BETWEEN 0 AND 1
        ),

    CONSTRAINT valid_verification_status
        CHECK (
            verification_status IN (
                'Pending',
                'Verified',
                'Rejected'
            )
        )
);

-- Indexes for faster user activity searches
CREATE INDEX idx_checkins_user
ON public.check_ins(user_id);

CREATE INDEX idx_checkins_point_time
ON public.check_ins(
    recycling_point_id,
    checked_in_at
);

CREATE INDEX idx_recycling_actions_user
ON public.recycling_actions(user_id);

-- Enable Row Level Security
ALTER TABLE public.check_ins
ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.recycling_actions
ENABLE ROW LEVEL SECURITY;

-- Ensure recycling activities reference
-- a check-in belonging to the same user

ALTER TABLE public.check_ins
ADD CONSTRAINT check_ins_id_user_unique
UNIQUE (id, user_id);

ALTER TABLE public.recycling_actions
ADD CONSTRAINT recycling_actions_checkin_owner_fk
FOREIGN KEY (check_in_id, user_id)
REFERENCES public.check_ins(id, user_id);
