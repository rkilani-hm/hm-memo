
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS print_duplex_mode text NOT NULL DEFAULT 'long_edge',
  ADD COLUMN IF NOT EXISTS print_blank_back_pages boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS print_watermark boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS print_include_attachments boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS print_color_mode text NOT NULL DEFAULT 'color',
  ADD COLUMN IF NOT EXISTS print_page_number_style text NOT NULL DEFAULT 'bottom_center',
  ADD COLUMN IF NOT EXISTS print_confidentiality_line text DEFAULT NULL;
