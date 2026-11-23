begin;

alter table private.account_demo drop constraint account_demo_manager_id_fkey;
alter table private.account_demo add constraint account_demo_manager_id_fkey
foreign key (manager_id) references public.profiles(id) on delete cascade;

commit;
