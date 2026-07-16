(function () {
  const allowedViews = new Set(["kanban", "list", "cards"]);
  const content = document.querySelector("[data-procedures-content]");
  const viewButtons = document.querySelectorAll("[data-procedures-view]");
  const refreshButton = document.querySelector("[data-procedures-refresh]");
  const totalTarget = document.querySelector("[data-procedures-total]");
  const summaryTotal = document.querySelector("[data-procedures-summary-total]");
  const summaryDeadline = document.querySelector("[data-procedures-summary-deadline]");
  const summaryUnassigned = document.querySelector("[data-procedures-summary-unassigned]");
  const searchInput = document.querySelector(".workspace-search-input");
  const token = window.localStorage.getItem("tenderland_token")
    || window.sessionStorage.getItem("tenderland_token");
  const savedView = window.localStorage.getItem("kortex_procedures_view");
  let currentView = allowedViews.has(savedView) ? savedView : "list";
  let procedures = [];
  let query = "";

  const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });

  const amountFormatter = new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 2
  });

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function icon(name) {
    const node = element("i");
    node.dataset.lucide = name;
    node.setAttribute("aria-hidden", "true");
    return node;
  }

  function refreshIcons() {
    window.lucide?.createIcons({ attrs: { "aria-hidden": "true" } });
  }

  function formatDate(value) {
    if (!value) return "Не указана";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Не указана" : dateFormatter.format(date);
  }

  function formatAmount(procedure) {
    if (!procedure.amount || procedure.amount <= 0) return "Не указана";
    const currency = procedure.currency ? ` ${procedure.currency}` : "";
    return `${amountFormatter.format(procedure.amount)}${currency}`;
  }

  function valueOrFallback(value) {
    return value || "Не указано";
  }

  function statusNode(status) {
    return element("span", "procedure-status", status || "Статус не указан");
  }

  function sourceLink(procedure) {
    if (!procedure.sourceUrl) return null;
    const link = element("a", "procedure-source-link");
    link.href = procedure.sourceUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.append("Источник", icon("external-link"));
    return link;
  }

  function detailHref(procedure) {
    return `/procedures/${encodeURIComponent(procedure.id)}`;
  }

  function procedureNameLink(procedure, headingTag) {
    const heading = element(headingTag, "procedure-name");
    const link = element("a", "procedure-name-link", procedure.name);
    link.href = detailHref(procedure);
    heading.append(link);
    return heading;
  }

  function makeNavigable(node, procedure) {
    node.classList.add("procedure-entry");
    node.dataset.procedureHref = detailHref(procedure);
    return node;
  }

  function procedureTitle(procedure) {
    const wrapper = element("div");
    wrapper.append(
      procedureNameLink(procedure, "p"),
      element("span", "procedure-reference", procedure.registrationNumber || procedure.externalId)
    );
    return wrapper;
  }

  function listView(items) {
    const wrapper = element("div", "procedure-table-wrap");
    const table = element("table", "procedure-table");
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");

    ["Процедура", "Заказчик", "Регион", "Цена", "Окончание", "Статус"].forEach((label) => {
      headRow.append(element("th", null, label));
    });
    head.append(headRow);

    const body = document.createElement("tbody");
    items.forEach((procedure) => {
      const row = makeNavigable(document.createElement("tr"), procedure);
      const titleCell = document.createElement("td");
      titleCell.append(procedureTitle(procedure));
      const link = sourceLink(procedure);
      if (link) titleCell.append(link);

      const customerCell = document.createElement("td");
      customerCell.textContent = valueOrFallback(procedure.customer);
      if (procedure.platform) customerCell.append(element("span", "procedure-meta", procedure.platform));

      const regionCell = element("td", null, valueOrFallback(procedure.region));
      const amountCell = element("td", null, formatAmount(procedure));
      const deadlineCell = element("td", null, formatDate(procedure.endDate));
      deadlineCell.append(element("span", "procedure-deadline-label", "Приём заявок"));
      const statusCell = document.createElement("td");
      statusCell.append(statusNode(procedure.status));

      row.append(titleCell, customerCell, regionCell, amountCell, deadlineCell, statusCell);
      body.append(row);
    });

    table.append(head, body);
    wrapper.append(table);
    return wrapper;
  }

  function detail(label, value) {
    const wrapper = document.createElement("div");
    wrapper.append(element("dt", null, label), element("dd", null, value));
    return wrapper;
  }

  function cardView(items) {
    const grid = element("div", "procedure-cards");

    items.forEach((procedure) => {
      const card = makeNavigable(element("article", "procedure-card"), procedure);
      const top = element("div", "procedure-card-topline");
      top.append(
        element("span", "procedure-reference", procedure.registrationNumber || procedure.externalId),
        element("span", "procedure-reference", formatDate(procedure.endDate))
      );

      const main = document.createElement("div");
      main.append(procedureNameLink(procedure, "h2"));
      const details = element("dl", "procedure-card-details");
      details.append(
        detail("Заказчик", valueOrFallback(procedure.customer)),
        detail("Регион", valueOrFallback(procedure.region)),
        detail("Цена", formatAmount(procedure)),
        detail("Площадка", valueOrFallback(procedure.platform))
      );
      main.append(details);

      const footer = element("footer", "procedure-card-footer");
      footer.append(statusNode(procedure.status));
      const link = sourceLink(procedure);
      if (link) footer.append(link);

      card.append(top, main, footer);
      grid.append(card);
    });

    return grid;
  }

  function kanbanCard(procedure) {
    const card = makeNavigable(element("article", "kanban-card"), procedure);
    card.append(
      element("span", "procedure-reference", procedure.registrationNumber || procedure.externalId),
      procedureNameLink(procedure, "h3"),
      statusNode(procedure.status)
    );
    const footer = element("footer", "kanban-card-footer");
    footer.append(
      element("span", null, formatDate(procedure.endDate)),
      element("span", null, valueOrFallback(procedure.region))
    );
    card.append(footer);
    return card;
  }

  function kanbanView(items) {
    const board = element("div", "procedure-kanban");
    const groups = new Map();

    items.forEach((procedure) => {
      const stage = procedure.stage || "Без стадии";
      if (!groups.has(stage)) groups.set(stage, []);
      groups.get(stage).push(procedure);
    });

    groups.forEach((stageItems, stage) => {
      const column = element("section", "kanban-column");
      const heading = element("header", "kanban-column-heading");
      heading.append(element("h2", null, stage), element("span", null, String(stageItems.length)));
      const list = element("div", "kanban-card-list");
      stageItems.forEach((procedure) => list.append(kanbanCard(procedure)));
      column.append(heading, list);
      board.append(column);
    });

    return board;
  }

  function filteredProcedures() {
    if (!query) return procedures;
    return procedures.filter((procedure) => [
      procedure.name,
      procedure.registrationNumber,
      procedure.externalId,
      procedure.customer,
      procedure.region,
      procedure.status,
      procedure.platform
    ].some((value) => value?.toLocaleLowerCase("ru-RU").includes(query)));
  }

  function updateSummary(items) {
    const now = Date.now();
    const week = now + (7 * 24 * 60 * 60 * 1000);
    const deadlineCount = items.filter((procedure) => {
      const deadline = new Date(procedure.endDate).getTime();
      return Number.isFinite(deadline) && deadline >= now && deadline <= week;
    }).length;
    const unassignedCount = items.filter((procedure) => !procedure.stage).length;

    totalTarget.textContent = String(items.length);
    summaryTotal.textContent = String(items.length);
    summaryDeadline.textContent = String(deadlineCount);
    summaryUnassigned.textContent = String(unassignedCount);
  }

  function render() {
    const items = filteredProcedures();
    updateSummary(items);
    content.replaceChildren();

    viewButtons.forEach((button) => {
      const isActive = button.dataset.proceduresView === currentView;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });

    if (!items.length) {
      const state = element("div", "procedures-state");
      state.append(
        element("strong", null, query ? "Ничего не найдено" : "Процедур пока нет"),
        element("p", null, query ? "Попробуйте изменить запрос" : "Импортированные процедуры появятся здесь")
      );
      content.append(state);
      refreshIcons();
      return;
    }

    const views = {
      list: listView,
      cards: cardView,
      kanban: kanbanView
    };
    content.append(views[currentView](items));
    refreshIcons();
  }

  async function loadProcedures() {
    refreshButton?.classList.add("is-loading");
    refreshButton?.setAttribute("disabled", "");

    try {
      const response = await fetch("/api/procedures?limit=30", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store"
      });

      if (response.status === 401) return;
      if (!response.ok) throw new Error("PROCEDURES_LOAD_FAILED");

      const data = await response.json();
      procedures = data.procedures || [];
      render();
    } catch {
      content.replaceChildren();
      const state = element("div", "procedures-state");
      state.append(
        element("strong", null, "Не удалось загрузить процедуры"),
        element("p", null, "Повторите попытку немного позже")
      );
      content.append(state);
    } finally {
      refreshButton?.classList.remove("is-loading");
      refreshButton?.removeAttribute("disabled");
      refreshIcons();
    }
  }

  viewButtons.forEach((button) => {
    button.addEventListener("click", () => {
      currentView = button.dataset.proceduresView;
      window.localStorage.setItem("kortex_procedures_view", currentView);
      render();
    });
  });

  refreshButton?.addEventListener("click", loadProcedures);
  searchInput?.addEventListener("input", () => {
    query = searchInput.value.trim().toLocaleLowerCase("ru-RU");
    render();
  });

  content?.addEventListener("click", (event) => {
    if (event.target.closest("a, button")) return;
    const entry = event.target.closest("[data-procedure-href]");
    if (entry) window.location.href = entry.dataset.procedureHref;
  });

  refreshIcons();
  loadProcedures();
})();
