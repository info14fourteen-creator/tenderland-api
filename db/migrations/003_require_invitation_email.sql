alter table invitations
drop constraint if exists invitations_email_required_check;

alter table invitations
add constraint invitations_email_required_check
check (email is not null) not valid;
