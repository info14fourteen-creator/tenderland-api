export const userCategories = ["user", "admin", "super_admin"];

export const businessRoles = [
  "Менеджер",
  "Специалист по работе с государственным сегментом",
  "Специалист юридической службы",
  "Финансовый контроллер",
  "Бухгалтер",
  "Специалист службы безопасности",
  "Специалист отдела закупок",
  "Специалист отдела продаж",
  "Специалист отдела делопроизводства",
  "Специалист отдела логистики"
];

export const defaultBusinessRole = "Менеджер";

export const defaultBusinessRoles = [...businessRoles];

export function primaryBusinessRole(roles = defaultBusinessRoles) {
  return roles.includes(defaultBusinessRole) ? defaultBusinessRole : roles[0] || defaultBusinessRole;
}
