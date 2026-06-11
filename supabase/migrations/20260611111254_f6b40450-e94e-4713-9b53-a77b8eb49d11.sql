CREATE POLICY "Users can delete own tryons"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'tryons' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update own tryons"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'tryons' AND auth.uid()::text = (storage.foldername(name))[1])
WITH CHECK (bucket_id = 'tryons' AND auth.uid()::text = (storage.foldername(name))[1]);