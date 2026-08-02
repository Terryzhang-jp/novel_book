-- ============================================================================
-- Legacy Baseline — 旧系统 schema 的唯一有效来源
-- ============================================================================
--
-- 生成方式：不是手工拼接。这份文件是把 supabase/legacy/ 下 15 个历史 SQL
-- 按实测出的正确依赖顺序在一个空 Postgres 上重放之后，pg_dump --schema-only
-- 导出的结果。因此它是「能跑通的那个 schema」，而不是「我们以为的 schema」。
--
-- 为什么要 squash：
--   原来的 8 个编号 migration 依赖 7 个未编号的临时脚本 —— 例如
--   007_add_canvas_magazine_columns.sql 会 ALTER canvas_projects，而那张表
--   由未编号的 scripts/create-canvas-table.sql 创建。光看 migrations/ 目录
--   永远推不出正确顺序。那不是可重演的历史，只是一批后期拼起来的 SQL。
--
--   由于旧 production 已被删除（DNS NXDOMAIN，数据已丢失），没有远程
--   migration 历史需要兼容，因此在此做一次正式的 baseline squash。
--
-- 考古记录：supabase/legacy/RECONSTRUCTION-NOTES.md
-- 验证：pnpm db:verify  （scripts/verify-schema-rebuild.sh）
--
-- ⚠️ 局限：这只能证明「这些 SQL 能建出一个自洽的 schema」，不能证明
--    「它与已删除的生产库结构相同」—— 那个参照物已经不存在。
--    应视为「旧系统的最后已知状态」，而非「已验证与生产一致的权威副本」。
--
-- ⚠️ 已包含 009（photos.is_public 默认 false）。
--
-- 后续所有 schema 变更请在本文件之后新增 migration，不要修改本文件。
-- ============================================================================

-- uuid_generate_v4() 由 001_initial_schema 使用；Supabase 默认已装，
-- 但本地/自建 Postgres 需要显式创建。
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- Name: public; Type: SCHEMA; Schema: -; Owner: -

-- Name: update_canvas_updated_at(); Type: FUNCTION; Schema: public; Owner: -

CREATE FUNCTION public.update_canvas_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Name: account; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.account (
    id text NOT NULL,
    user_id text NOT NULL,
    account_id text NOT NULL,
    provider_id text NOT NULL,
    access_token text,
    refresh_token text,
    access_token_expires_at timestamp with time zone,
    refresh_token_expires_at timestamp with time zone,
    scope text,
    id_token text,
    password text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Name: ai_magic_history; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.ai_magic_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    user_prompt text NOT NULL,
    input_image_count integer DEFAULT 0 NOT NULL,
    style_image_count integer DEFAULT 0 NOT NULL,
    optimized_prompt text NOT NULL,
    reasoning text,
    result_image text NOT NULL,
    model text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Name: canvas_projects; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.canvas_projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text DEFAULT 'Untitled Canvas'::text NOT NULL,
    current_page integer DEFAULT 1 NOT NULL,
    pages jsonb DEFAULT '[]'::jsonb NOT NULL,
    thumbnail_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_magazine_mode boolean DEFAULT true,
    current_page_index integer DEFAULT 0,
    version integer DEFAULT 1 NOT NULL
);

-- Name: documents; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.documents (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    content jsonb DEFAULT '{}'::jsonb NOT NULL,
    images text[] DEFAULT ARRAY[]::text[],
    tags text[] DEFAULT ARRAY[]::text[],
    preview text,
    is_public boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    ai_partner_memory jsonb DEFAULT '{"userIntent": {"goal": null, "genre": null, "themes": [], "outline": null, "deadline": null, "goalConfidence": 0, "targetWordCount": null, "goalConfirmedByUser": false}, "writingStyle": {"tone": "neutral", "pacing": "moderate", "vocabulary": "standard", "preferredSentenceLength": "mixed"}, "conversationHistory": [], "contentUnderstanding": {"scenes": [], "characters": [], "narrativeArc": null, "currentChapter": null, "documentSummary": ""}}'::jsonb
);

-- Name: locations; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.locations (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    coordinates jsonb NOT NULL,
    address jsonb,
    place_id text,
    category text,
    notes text,
    usage_count integer DEFAULT 0,
    last_used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_public boolean DEFAULT false
);

-- Name: photo_embeddings; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.photo_embeddings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    photo_id uuid NOT NULL,
    user_id uuid NOT NULL,
    vector double precision[] NOT NULL,
    dimension integer DEFAULT 512 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Name: photos; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.photos (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    file_name text NOT NULL,
    original_name text NOT NULL,
    file_url text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    location_id uuid,
    category text NOT NULL,
    title text,
    description jsonb,
    tags text[] DEFAULT ARRAY[]::text[],
    is_public boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    trashed boolean DEFAULT false,
    trashed_at timestamp with time zone,
    original_file_url text,
    edited boolean DEFAULT false,
    edited_at timestamp with time zone,
    thumbnail_url text,
    CONSTRAINT photos_category_check CHECK ((category = ANY (ARRAY['time-location'::text, 'time-only'::text, 'location-only'::text, 'neither'::text])))
);

-- Name: session; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.session (
    id text NOT NULL,
    user_id text NOT NULL,
    token text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    ip_address text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Name: user; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public."user" (
    id text NOT NULL,
    name text,
    email text NOT NULL,
    email_verified boolean DEFAULT false,
    image text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    require_password_change boolean DEFAULT false,
    security_question text,
    security_answer_hash text
);

-- Name: users; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.users (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    name text,
    profile jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    require_password_change boolean DEFAULT true NOT NULL,
    security_question text,
    security_answer_hash text
);

-- Name: verification; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.verification (
    id text NOT NULL,
    identifier text NOT NULL,
    value text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Name: account account_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.account
    ADD CONSTRAINT account_pkey PRIMARY KEY (id);

-- Name: account account_provider_id_account_id_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.account
    ADD CONSTRAINT account_provider_id_account_id_key UNIQUE (provider_id, account_id);

-- Name: ai_magic_history ai_magic_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.ai_magic_history
    ADD CONSTRAINT ai_magic_history_pkey PRIMARY KEY (id);

-- Name: canvas_projects canvas_projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.canvas_projects
    ADD CONSTRAINT canvas_projects_pkey PRIMARY KEY (id);

-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);

-- Name: locations locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_pkey PRIMARY KEY (id);

-- Name: photo_embeddings photo_embeddings_photo_id_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.photo_embeddings
    ADD CONSTRAINT photo_embeddings_photo_id_key UNIQUE (photo_id);

-- Name: photo_embeddings photo_embeddings_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.photo_embeddings
    ADD CONSTRAINT photo_embeddings_pkey PRIMARY KEY (id);

-- Name: photos photos_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.photos
    ADD CONSTRAINT photos_pkey PRIMARY KEY (id);

-- Name: session session_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (id);

-- Name: session session_token_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_token_key UNIQUE (token);

-- Name: user user_email_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT user_email_key UNIQUE (email);

-- Name: user user_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT user_pkey PRIMARY KEY (id);

-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);

-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);

-- Name: verification verification_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.verification
    ADD CONSTRAINT verification_pkey PRIMARY KEY (id);

-- Name: idx_account_provider; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_account_provider ON public.account USING btree (provider_id, account_id);

-- Name: idx_account_user_id; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_account_user_id ON public.account USING btree (user_id);

-- Name: idx_ai_magic_history_created_at; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_ai_magic_history_created_at ON public.ai_magic_history USING btree (created_at DESC);

-- Name: idx_ai_magic_history_user_id; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_ai_magic_history_user_id ON public.ai_magic_history USING btree (user_id);

-- Name: idx_canvas_projects_updated_at; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_canvas_projects_updated_at ON public.canvas_projects USING btree (updated_at DESC);

-- Name: idx_canvas_projects_user_id; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_canvas_projects_user_id ON public.canvas_projects USING btree (user_id);

-- Name: idx_canvas_projects_version; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_canvas_projects_version ON public.canvas_projects USING btree (id, version);

-- Name: idx_documents_ai_partner_memory; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_documents_ai_partner_memory ON public.documents USING gin (ai_partner_memory);

-- Name: idx_documents_created_at; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_documents_created_at ON public.documents USING btree (created_at DESC);

-- Name: idx_documents_is_public; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_documents_is_public ON public.documents USING btree (is_public);

-- Name: idx_documents_updated_at; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_documents_updated_at ON public.documents USING btree (updated_at DESC);

-- Name: idx_documents_user_id; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_documents_user_id ON public.documents USING btree (user_id);

-- Name: idx_locations_is_public; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_locations_is_public ON public.locations USING btree (is_public);

-- Name: idx_locations_usage_count; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_locations_usage_count ON public.locations USING btree (usage_count DESC);

-- Name: idx_locations_user_id; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_locations_user_id ON public.locations USING btree (user_id);

-- Name: idx_photo_embeddings_photo_id; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_photo_embeddings_photo_id ON public.photo_embeddings USING btree (photo_id);

-- Name: idx_photo_embeddings_user_id; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_photo_embeddings_user_id ON public.photo_embeddings USING btree (user_id);

-- Name: idx_photos_category; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_photos_category ON public.photos USING btree (category);

-- Name: idx_photos_created_at; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_photos_created_at ON public.photos USING btree (created_at DESC);

-- Name: idx_photos_edited; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_photos_edited ON public.photos USING btree (user_id, edited) WHERE (edited = true);

-- Name: idx_photos_is_public; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_photos_is_public ON public.photos USING btree (is_public);

-- Name: idx_photos_location_id; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_photos_location_id ON public.photos USING btree (location_id);

-- Name: idx_photos_thumbnail; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_photos_thumbnail ON public.photos USING btree (thumbnail_url) WHERE (thumbnail_url IS NOT NULL);

-- Name: idx_photos_trashed; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_photos_trashed ON public.photos USING btree (user_id, trashed) WHERE (trashed = false);

-- Name: idx_photos_trashed_at; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_photos_trashed_at ON public.photos USING btree (user_id, trashed_at) WHERE (trashed = true);

-- Name: idx_photos_user_id; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_photos_user_id ON public.photos USING btree (user_id);

-- Name: idx_session_expires_at; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_session_expires_at ON public.session USING btree (expires_at);

-- Name: idx_session_token; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_session_token ON public.session USING btree (token);

-- Name: idx_session_user_id; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_session_user_id ON public.session USING btree (user_id);

-- Name: idx_user_email; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_user_email ON public."user" USING btree (email);

-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_users_email ON public.users USING btree (email);

-- Name: idx_users_has_security_question; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_users_has_security_question ON public.users USING btree (((security_question IS NOT NULL)));

-- Name: idx_verification_expires_at; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_verification_expires_at ON public.verification USING btree (expires_at);

-- Name: idx_verification_identifier; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_verification_identifier ON public.verification USING btree (identifier);

-- Name: canvas_projects canvas_projects_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER canvas_projects_updated_at BEFORE UPDATE ON public.canvas_projects FOR EACH ROW EXECUTE FUNCTION public.update_canvas_updated_at();

-- Name: account update_account_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER update_account_updated_at BEFORE UPDATE ON public.account FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Name: documents update_documents_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Name: locations update_locations_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER update_locations_updated_at BEFORE UPDATE ON public.locations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Name: photos update_photos_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER update_photos_updated_at BEFORE UPDATE ON public.photos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Name: session update_session_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER update_session_updated_at BEFORE UPDATE ON public.session FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Name: user update_user_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER update_user_updated_at BEFORE UPDATE ON public."user" FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Name: users update_users_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Name: verification update_verification_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER update_verification_updated_at BEFORE UPDATE ON public.verification FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Name: account account_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.account
    ADD CONSTRAINT account_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;

-- Name: ai_magic_history ai_magic_history_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.ai_magic_history
    ADD CONSTRAINT ai_magic_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- Name: canvas_projects canvas_projects_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.canvas_projects
    ADD CONSTRAINT canvas_projects_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- Name: documents documents_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- Name: photos fk_photos_location; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.photos
    ADD CONSTRAINT fk_photos_location FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE SET NULL;

-- Name: locations locations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- Name: photo_embeddings photo_embeddings_photo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.photo_embeddings
    ADD CONSTRAINT photo_embeddings_photo_id_fkey FOREIGN KEY (photo_id) REFERENCES public.photos(id) ON DELETE CASCADE;

-- Name: photo_embeddings photo_embeddings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.photo_embeddings
    ADD CONSTRAINT photo_embeddings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- Name: photos photos_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.photos
    ADD CONSTRAINT photos_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- Name: session session_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;

-- Name: documents Public documents are viewable by everyone; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Public documents are viewable by everyone" ON public.documents FOR SELECT USING ((is_public = true));

-- Name: locations Public locations are viewable by everyone; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Public locations are viewable by everyone" ON public.locations FOR SELECT USING ((is_public = true));

-- Name: photos Public photos are viewable by everyone; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Public photos are viewable by everyone" ON public.photos FOR SELECT USING ((is_public = true));

-- Name: canvas_projects Service role full access; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Service role full access" ON public.canvas_projects USING (true) WITH CHECK (true);

-- Name: ai_magic_history Service role full access on ai_magic_history; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Service role full access on ai_magic_history" ON public.ai_magic_history USING (true) WITH CHECK (true);

-- Name: documents Users can create own documents; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Users can create own documents" ON public.documents FOR INSERT WITH CHECK (((auth.uid())::text = (user_id)::text));

-- Name: locations Users can create own locations; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Users can create own locations" ON public.locations FOR INSERT WITH CHECK (((auth.uid())::text = (user_id)::text));

-- Name: photos Users can create own photos; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Users can create own photos" ON public.photos FOR INSERT WITH CHECK (((auth.uid())::text = (user_id)::text));

-- Name: ai_magic_history Users can delete own ai magic history; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Users can delete own ai magic history" ON public.ai_magic_history FOR DELETE USING (((auth.uid())::text = (user_id)::text));

-- Name: canvas_projects Users can delete own canvas projects; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Users can delete own canvas projects" ON public.canvas_projects FOR DELETE USING (((auth.uid())::text = (user_id)::text));

-- Name: documents Users can delete own documents; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Users can delete own documents" ON public.documents FOR DELETE USING (((auth.uid())::text = (user_id)::text));

-- Name: locations Users can delete own locations; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Users can delete own locations" ON public.locations FOR DELETE USING (((auth.uid())::text = (user_id)::text));

-- Name: photos Users can delete own photos; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Users can delete own photos" ON public.photos FOR DELETE USING (((auth.uid())::text = (user_id)::text));

-- Name: ai_magic_history Users can insert own ai magic history; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Users can insert own ai magic history" ON public.ai_magic_history FOR INSERT WITH CHECK (((auth.uid())::text = (user_id)::text));

-- Name: canvas_projects Users can insert own canvas projects; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Users can insert own canvas projects" ON public.canvas_projects FOR INSERT WITH CHECK (((auth.uid())::text = (user_id)::text));

-- Name: canvas_projects Users can update own canvas projects; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Users can update own canvas projects" ON public.canvas_projects FOR UPDATE USING (((auth.uid())::text = (user_id)::text));

-- Name: documents Users can update own documents; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Users can update own documents" ON public.documents FOR UPDATE USING (((auth.uid())::text = (user_id)::text));

-- Name: locations Users can update own locations; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Users can update own locations" ON public.locations FOR UPDATE USING (((auth.uid())::text = (user_id)::text));

-- Name: photos Users can update own photos; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Users can update own photos" ON public.photos FOR UPDATE USING (((auth.uid())::text = (user_id)::text));

-- Name: users Users can update own profile; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Users can update own profile" ON public.users FOR UPDATE USING (((auth.uid())::text = (id)::text));

-- Name: ai_magic_history Users can view own ai magic history; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Users can view own ai magic history" ON public.ai_magic_history FOR SELECT USING (((auth.uid())::text = (user_id)::text));

-- Name: canvas_projects Users can view own canvas projects; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Users can view own canvas projects" ON public.canvas_projects FOR SELECT USING (((auth.uid())::text = (user_id)::text));

-- Name: documents Users can view own documents; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Users can view own documents" ON public.documents FOR SELECT USING (((auth.uid())::text = (user_id)::text));

-- Name: locations Users can view own locations; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Users can view own locations" ON public.locations FOR SELECT USING (((auth.uid())::text = (user_id)::text));

-- Name: photos Users can view own photos; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Users can view own photos" ON public.photos FOR SELECT USING (((auth.uid())::text = (user_id)::text));

-- Name: users Users can view own profile; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Users can view own profile" ON public.users FOR SELECT USING (((auth.uid())::text = (id)::text));

-- Name: ai_magic_history; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.ai_magic_history ENABLE ROW LEVEL SECURITY;

-- Name: canvas_projects; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.canvas_projects ENABLE ROW LEVEL SECURITY;

-- Name: documents; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Name: locations; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

-- Name: photos; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.photos ENABLE ROW LEVEL SECURITY;

-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

