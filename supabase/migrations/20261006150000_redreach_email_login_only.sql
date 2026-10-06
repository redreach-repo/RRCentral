-- Restrict Central team membership to @redreach.ae (no personal Gmail logins).
update app_users
set active = false
where email !~* '@redreach\.ae$';
