
CREATE POLICY "own folder read uploads" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'user-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "own folder write uploads" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'user-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "own folder update uploads" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'user-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "own folder delete uploads" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'user-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "own folder read tryons" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'tryons' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "own folder write tryons" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'tryons' AND auth.uid()::text = (storage.foldername(name))[1]);
