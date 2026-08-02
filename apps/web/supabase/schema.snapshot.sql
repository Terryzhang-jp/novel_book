-- 规范化 schema 快照 —— 由 scripts/verify-schema-rebuild.sh --update 生成
-- 不要手工编辑。schema 有意变更时重新生成并连同 migration 一起提交。
-- 内容已排序且剔除环境相关行，仅用于 DDL 一致性 diff，不可直接执行。

    access_token text,
    access_token_expires_at timestamp with time zone,
    account_id text NOT NULL,
    ADD CONSTRAINT account_pkey PRIMARY KEY (id);
    ADD CONSTRAINT account_provider_id_account_id_key UNIQUE (provider_id, account_id);
    ADD CONSTRAINT account_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;
    ADD CONSTRAINT ai_magic_history_pkey PRIMARY KEY (id);
    ADD CONSTRAINT ai_magic_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;
    ADD CONSTRAINT canvas_projects_pkey PRIMARY KEY (id);
    ADD CONSTRAINT canvas_projects_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);
    ADD CONSTRAINT documents_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;
    ADD CONSTRAINT fk_photos_location FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE SET NULL;
    ADD CONSTRAINT locations_pkey PRIMARY KEY (id);
    ADD CONSTRAINT locations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;
    ADD CONSTRAINT photo_embeddings_photo_id_fkey FOREIGN KEY (photo_id) REFERENCES public.photos(id) ON DELETE CASCADE;
    ADD CONSTRAINT photo_embeddings_photo_id_key UNIQUE (photo_id);
    ADD CONSTRAINT photo_embeddings_pkey PRIMARY KEY (id);
    ADD CONSTRAINT photo_embeddings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;
    ADD CONSTRAINT photos_pkey PRIMARY KEY (id);
    ADD CONSTRAINT photos_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;
    ADD CONSTRAINT session_pkey PRIMARY KEY (id);
    ADD CONSTRAINT session_token_key UNIQUE (token);
    ADD CONSTRAINT session_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;
    ADD CONSTRAINT user_email_key UNIQUE (email);
    ADD CONSTRAINT user_pkey PRIMARY KEY (id);
    ADD CONSTRAINT users_email_key UNIQUE (email);
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);
    ADD CONSTRAINT verification_pkey PRIMARY KEY (id);
    address jsonb,
    ai_partner_memory jsonb DEFAULT '{"userIntent": {"goal": null, "genre": null, "themes": [], "outline": null, "deadline": null, "goalConfidence": 0, "targetWordCount": null, "goalConfirmedByUser": false}, "writingStyle": {"tone": "neutral", "pacing": "moderate", "vocabulary": "standard", "preferredSentenceLength": "mixed"}, "conversationHistory": [], "contentUnderstanding": {"scenes": [], "characters": [], "narrativeArc": null, "currentChapter": null, "documentSummary": ""}}'::jsonb
    AS $$
    AS $$
    category text NOT NULL,
    category text,
    CONSTRAINT photos_category_check CHECK ((category = ANY (ARRAY['time-location'::text, 'time-only'::text, 'location-only'::text, 'neither'::text])))
    content jsonb DEFAULT '{}'::jsonb NOT NULL,
    coordinates jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    current_page integer DEFAULT 1 NOT NULL,
    current_page_index integer DEFAULT 0,
    description jsonb,
    dimension integer DEFAULT 512 NOT NULL,
    edited boolean DEFAULT false,
    edited_at timestamp with time zone,
    email text NOT NULL,
    email text NOT NULL,
    email_verified boolean DEFAULT false,
    expires_at timestamp with time zone NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    file_name text NOT NULL,
    file_url text NOT NULL,
    id text NOT NULL,
    id text NOT NULL,
    id text NOT NULL,
    id text NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    id_token text,
    identifier text NOT NULL,
    image text,
    images text[] DEFAULT ARRAY[]::text[],
    input_image_count integer DEFAULT 0 NOT NULL,
    ip_address text,
    is_magazine_mode boolean DEFAULT true,
    is_public boolean DEFAULT false
    is_public boolean DEFAULT false,
    is_public boolean DEFAULT false,
    LANGUAGE plpgsql
    LANGUAGE plpgsql
    last_used_at timestamp with time zone,
    location_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb,
    model text NOT NULL,
    name text NOT NULL,
    name text,
    name text,
    NEW.updated_at = NOW();
    notes text,
    optimized_prompt text NOT NULL,
    original_file_url text,
    original_name text NOT NULL,
    pages jsonb DEFAULT '[]'::jsonb NOT NULL,
    password text,
    password_hash text NOT NULL,
    photo_id uuid NOT NULL,
    place_id text,
    preview text,
    profile jsonb DEFAULT '{}'::jsonb,
    provider_id text NOT NULL,
    reasoning text,
    refresh_token text,
    refresh_token_expires_at timestamp with time zone,
    require_password_change boolean DEFAULT false,
    require_password_change boolean DEFAULT true NOT NULL,
    result_image text NOT NULL,
    RETURN NEW;
    scope text,
    security_answer_hash text
    security_answer_hash text
    security_question text,
    security_question text,
    style_image_count integer DEFAULT 0 NOT NULL,
    tags text[] DEFAULT ARRAY[]::text[],
    tags text[] DEFAULT ARRAY[]::text[],
    thumbnail_url text,
    thumbnail_url text,
    title text DEFAULT 'Untitled Canvas'::text NOT NULL,
    title text NOT NULL,
    title text,
    token text NOT NULL,
    trashed boolean DEFAULT false,
    trashed_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now()
    updated_at timestamp with time zone DEFAULT now()
    updated_at timestamp with time zone DEFAULT now()
    updated_at timestamp with time zone DEFAULT now()
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    usage_count integer DEFAULT 0,
    user_agent text,
    user_id text NOT NULL,
    user_id text NOT NULL,
    user_id text NOT NULL,
    user_id text NOT NULL,
    user_id text NOT NULL,
    user_id text NOT NULL,
    user_id text NOT NULL,
    user_id text NOT NULL,
    user_prompt text NOT NULL,
    value text NOT NULL,
    vector double precision[] NOT NULL,
    version integer DEFAULT 1 NOT NULL
  NEW.updated_at = NOW();
  RETURN NEW;
);
);
);
);
);
);
);
);
);
);
);
$$;
$$;
ALTER TABLE ONLY public."user"
ALTER TABLE ONLY public."user"
ALTER TABLE ONLY public.account
ALTER TABLE ONLY public.account
ALTER TABLE ONLY public.account
ALTER TABLE ONLY public.ai_magic_history
ALTER TABLE ONLY public.ai_magic_history
ALTER TABLE ONLY public.canvas_projects
ALTER TABLE ONLY public.canvas_projects
ALTER TABLE ONLY public.documents
ALTER TABLE ONLY public.documents
ALTER TABLE ONLY public.locations
ALTER TABLE ONLY public.locations
ALTER TABLE ONLY public.photo_embeddings
ALTER TABLE ONLY public.photo_embeddings
ALTER TABLE ONLY public.photo_embeddings
ALTER TABLE ONLY public.photo_embeddings
ALTER TABLE ONLY public.photos
ALTER TABLE ONLY public.photos
ALTER TABLE ONLY public.photos
ALTER TABLE ONLY public.session
ALTER TABLE ONLY public.session
ALTER TABLE ONLY public.session
ALTER TABLE ONLY public.users
ALTER TABLE ONLY public.users
ALTER TABLE ONLY public.verification
ALTER TABLE public.ai_magic_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canvas_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
BEGIN
BEGIN
CREATE FUNCTION public.update_canvas_updated_at() RETURNS trigger
CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
CREATE INDEX idx_account_provider ON public.account USING btree (provider_id, account_id);
CREATE INDEX idx_account_user_id ON public.account USING btree (user_id);
CREATE INDEX idx_ai_magic_history_created_at ON public.ai_magic_history USING btree (created_at DESC);
CREATE INDEX idx_ai_magic_history_user_id ON public.ai_magic_history USING btree (user_id);
CREATE INDEX idx_canvas_projects_updated_at ON public.canvas_projects USING btree (updated_at DESC);
CREATE INDEX idx_canvas_projects_user_id ON public.canvas_projects USING btree (user_id);
CREATE INDEX idx_canvas_projects_version ON public.canvas_projects USING btree (id, version);
CREATE INDEX idx_documents_ai_partner_memory ON public.documents USING gin (ai_partner_memory);
CREATE INDEX idx_documents_created_at ON public.documents USING btree (created_at DESC);
CREATE INDEX idx_documents_is_public ON public.documents USING btree (is_public);
CREATE INDEX idx_documents_updated_at ON public.documents USING btree (updated_at DESC);
CREATE INDEX idx_documents_user_id ON public.documents USING btree (user_id);
CREATE INDEX idx_locations_is_public ON public.locations USING btree (is_public);
CREATE INDEX idx_locations_usage_count ON public.locations USING btree (usage_count DESC);
CREATE INDEX idx_locations_user_id ON public.locations USING btree (user_id);
CREATE INDEX idx_photo_embeddings_photo_id ON public.photo_embeddings USING btree (photo_id);
CREATE INDEX idx_photo_embeddings_user_id ON public.photo_embeddings USING btree (user_id);
CREATE INDEX idx_photos_category ON public.photos USING btree (category);
CREATE INDEX idx_photos_created_at ON public.photos USING btree (created_at DESC);
CREATE INDEX idx_photos_edited ON public.photos USING btree (user_id, edited) WHERE (edited = true);
CREATE INDEX idx_photos_is_public ON public.photos USING btree (is_public);
CREATE INDEX idx_photos_location_id ON public.photos USING btree (location_id);
CREATE INDEX idx_photos_thumbnail ON public.photos USING btree (thumbnail_url) WHERE (thumbnail_url IS NOT NULL);
CREATE INDEX idx_photos_trashed ON public.photos USING btree (user_id, trashed) WHERE (trashed = false);
CREATE INDEX idx_photos_trashed_at ON public.photos USING btree (user_id, trashed_at) WHERE (trashed = true);
CREATE INDEX idx_photos_user_id ON public.photos USING btree (user_id);
CREATE INDEX idx_session_expires_at ON public.session USING btree (expires_at);
CREATE INDEX idx_session_token ON public.session USING btree (token);
CREATE INDEX idx_session_user_id ON public.session USING btree (user_id);
CREATE INDEX idx_user_email ON public."user" USING btree (email);
CREATE INDEX idx_users_email ON public.users USING btree (email);
CREATE INDEX idx_users_has_security_question ON public.users USING btree (((security_question IS NOT NULL)));
CREATE INDEX idx_verification_expires_at ON public.verification USING btree (expires_at);
CREATE INDEX idx_verification_identifier ON public.verification USING btree (identifier);
CREATE POLICY "Public documents are viewable by everyone" ON public.documents FOR SELECT USING ((is_public = true));
CREATE POLICY "Public locations are viewable by everyone" ON public.locations FOR SELECT USING ((is_public = true));
CREATE POLICY "Public photos are viewable by everyone" ON public.photos FOR SELECT USING ((is_public = true));
CREATE POLICY "Service role full access on ai_magic_history" ON public.ai_magic_history USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON public.canvas_projects USING (true) WITH CHECK (true);
CREATE POLICY "Users can create own documents" ON public.documents FOR INSERT WITH CHECK (((auth.uid())::text = user_id));
CREATE POLICY "Users can create own locations" ON public.locations FOR INSERT WITH CHECK (((auth.uid())::text = user_id));
CREATE POLICY "Users can create own photos" ON public.photos FOR INSERT WITH CHECK (((auth.uid())::text = user_id));
CREATE POLICY "Users can delete own ai magic history" ON public.ai_magic_history FOR DELETE USING (((auth.uid())::text = user_id));
CREATE POLICY "Users can delete own canvas projects" ON public.canvas_projects FOR DELETE USING (((auth.uid())::text = user_id));
CREATE POLICY "Users can delete own documents" ON public.documents FOR DELETE USING (((auth.uid())::text = user_id));
CREATE POLICY "Users can delete own locations" ON public.locations FOR DELETE USING (((auth.uid())::text = user_id));
CREATE POLICY "Users can delete own photos" ON public.photos FOR DELETE USING (((auth.uid())::text = user_id));
CREATE POLICY "Users can insert own ai magic history" ON public.ai_magic_history FOR INSERT WITH CHECK (((auth.uid())::text = user_id));
CREATE POLICY "Users can insert own canvas projects" ON public.canvas_projects FOR INSERT WITH CHECK (((auth.uid())::text = user_id));
CREATE POLICY "Users can update own canvas projects" ON public.canvas_projects FOR UPDATE USING (((auth.uid())::text = user_id));
CREATE POLICY "Users can update own documents" ON public.documents FOR UPDATE USING (((auth.uid())::text = user_id));
CREATE POLICY "Users can update own locations" ON public.locations FOR UPDATE USING (((auth.uid())::text = user_id));
CREATE POLICY "Users can update own photos" ON public.photos FOR UPDATE USING (((auth.uid())::text = user_id));
CREATE POLICY "Users can update own profile" ON public.users FOR UPDATE USING (((auth.uid())::text = (id)::text));
CREATE POLICY "Users can view own ai magic history" ON public.ai_magic_history FOR SELECT USING (((auth.uid())::text = user_id));
CREATE POLICY "Users can view own canvas projects" ON public.canvas_projects FOR SELECT USING (((auth.uid())::text = user_id));
CREATE POLICY "Users can view own documents" ON public.documents FOR SELECT USING (((auth.uid())::text = user_id));
CREATE POLICY "Users can view own locations" ON public.locations FOR SELECT USING (((auth.uid())::text = user_id));
CREATE POLICY "Users can view own photos" ON public.photos FOR SELECT USING (((auth.uid())::text = user_id));
CREATE POLICY "Users can view own profile" ON public.users FOR SELECT USING (((auth.uid())::text = (id)::text));
CREATE SCHEMA public;
CREATE TABLE public."user" (
CREATE TABLE public.account (
CREATE TABLE public.ai_magic_history (
CREATE TABLE public.canvas_projects (
CREATE TABLE public.documents (
CREATE TABLE public.locations (
CREATE TABLE public.photo_embeddings (
CREATE TABLE public.photos (
CREATE TABLE public.session (
CREATE TABLE public.users (
CREATE TABLE public.verification (
CREATE TRIGGER canvas_projects_updated_at BEFORE UPDATE ON public.canvas_projects FOR EACH ROW EXECUTE FUNCTION public.update_canvas_updated_at();
CREATE TRIGGER update_account_updated_at BEFORE UPDATE ON public.account FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_locations_updated_at BEFORE UPDATE ON public.locations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_photos_updated_at BEFORE UPDATE ON public.photos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_session_updated_at BEFORE UPDATE ON public.session FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_user_updated_at BEFORE UPDATE ON public."user" FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_verification_updated_at BEFORE UPDATE ON public.verification FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
END;
END;
