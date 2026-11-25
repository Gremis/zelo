insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
values
('a2050000-0000-4000-8000-000000000001','seed-existing-manager@example.invalid',now(),'{"is_sindico":true,"full_name":"Synthetic seed manager"}'),
('a2050000-0000-4000-8000-000000000002','seed-existing-member@example.invalid',now(),'{"is_sindico":false,"full_name":"Synthetic seed member"}');
