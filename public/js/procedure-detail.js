(function () {
  const state = document.querySelector("[data-procedure-detail-state]");
  const detailRoot = document.querySelector("[data-procedure-detail]");
  const tabContent = document.querySelector("[data-procedure-tab-content]");
  const tabButtons = document.querySelectorAll("[data-procedure-tab]");
  const workSummary = document.querySelector("[data-procedure-work-summary]");
  const workFields = document.querySelector("[data-procedure-work-fields]");
  const token = window.localStorage.getItem("tenderland_token")
    || window.sessionStorage.getItem("tenderland_token");
  const procedureId = window.location.pathname.split("/").filter(Boolean).at(-1);
  let procedure = null;
  let activeTab = "overview";

  const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  });
  const dateTimeFormatter = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
  const numberFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });

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

  function formatDate(value, withTime = false) {
    if (!value || String(value).startsWith("0001-")) return "Не указана";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Не указана";
    return (withTime ? dateTimeFormatter : dateFormatter).format(date);
  }

  function formatNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? numberFormatter.format(number) : "Не указано";
  }

  function formatMoney(value, currency) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return "Не указана";
    return `${numberFormatter.format(number)}${currency ? ` ${currency}` : ""}`;
  }

  function display(value, fallback = "Не указано") {
    if (Array.isArray(value)) return value.filter(Boolean).join(", ") || fallback;
    if (value === null || value === undefined || value === "") return fallback;
    return String(value);
  }

  function detailItem(label, value, className) {
    const wrapper = element("div", className);
    wrapper.append(element("dt", null, label), element("dd", null, display(value)));
    return wrapper;
  }

  function section(title, count) {
    const wrapper = element("section", "procedure-section");
    const heading = element("header", "procedure-section-heading");
    heading.append(element("h2", null, title));
    if (count !== undefined) heading.append(element("span", "procedure-section-count", String(count)));
    wrapper.append(heading);
    return wrapper;
  }

  function empty(message) {
    return element("p", "procedure-empty", message);
  }

  function tenders() {
    return (procedure.sourceData?.rows || []).map((row) => row?.tender).filter(Boolean);
  }

  function primaryTender() {
    return tenders()[0] || {};
  }

  function uniqueBy(items, getKey) {
    const seen = new Set();
    return items.filter((item) => {
      const key = getKey(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function renderKeyFacts() {
    const target = document.querySelector("[data-procedure-key-facts]");
    const tender = primaryTender();
    const customer = tender.customers?.[0] || {};
    target.replaceChildren(
      detailItem("Начальная цена", formatMoney(procedure.amount, procedure.currency)),
      detailItem("Окончание подачи", formatDate(procedure.endDate)),
      detailItem("Заказчик", procedure.customer),
      detailItem("Регион", procedure.region),
      detailItem("Площадка", procedure.platform),
      detailItem("Лоты / заказчики", `${display(tender.lotCount, "1")} / ${display(tender.customersCount || tender.customers?.length, "1")}`)
    );
    if (!procedure.customer && customer.lotCustomerFullName) {
      target.children[2].querySelector("dd").textContent = customer.lotCustomerFullName;
    }
  }

  function renderOverview() {
    const tender = primaryTender();
    const fragment = document.createDocumentFragment();

    const main = section("Основные сведения");
    const mainGrid = element("dl", "procedure-data-grid");
    mainGrid.append(
      detailItem("Модуль", tender.module),
      detailItem("Статус Tenderland", tender.status),
      detailItem("Электронная площадка", tender.etpName),
      detailItem("Публикация", formatDate(tender.publishDate)),
      detailItem("Начало подачи", formatDate(tender.beginDate)),
      detailItem("Окончание подачи", formatDate(tender.endDate)),
      detailItem("Подведение итогов", formatDate(tender.summingUpDate)),
      detailItem("Часовой пояс", tender.timeZone),
      detailItem("Категория", display(tender.lotCategories), "Не указана")
    );
    main.append(mainGrid);
    fragment.append(main);

    const participation = section("Условия участия");
    const participationGrid = element("dl", "procedure-data-grid");
    participationGrid.append(
      detailItem("Обеспечение заявки", tender.lotApplicationGuaranteePrice || tender.lotWarrantySourceSum),
      detailItem("Обеспечение заявки, %", tender.lotWarrantyPercent),
      detailItem("Обеспечение договора", tender.lotContractGuaranteePrice),
      detailItem("Обеспечение договора, %", tender.lotContractGuaranteePercent),
      detailItem("Аванс, %", tender.lotAdvanceSumPercent),
      detailItem("Цена за единицу", tender.lotBeginSumPricesOfUnits)
    );
    participation.append(participationGrid);
    fragment.append(participation);

    const delivery = section("Поставка");
    const deliveryGrid = element("dl", "procedure-data-grid");
    deliveryGrid.append(
      detailItem("Срок поставки", tender.lotDeliveryTerm, "procedure-data-wide"),
      detailItem("Место поставки", display(tender.lotDeliveryPlacesText), "procedure-data-wide")
    );
    delivery.append(deliveryGrid);
    fragment.append(delivery);

    return fragment;
  }

  function products() {
    return tenders().flatMap((tender, tenderIndex) =>
      (tender.products || []).map((product, productIndex) => ({
        ...product,
        lotName: tender.lotName || tender.name,
        lotNumber: tender.lotOrdinalNumber || tenderIndex + 1,
        rowNumber: productIndex + 1,
        currency: tender.lotCurrency
      }))
    );
  }

  function renderProducts() {
    const items = products();
    const wrapper = section("Состав закупки", items.length);
    if (!items.length) {
      wrapper.append(empty("Позиции закупки не переданы источником"));
      return wrapper;
    }

    const scroll = element("div", "procedure-table-scroll");
    const table = element("table", "procedure-products-table");
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    ["Наименование", "Код КТРУ", "Количество", "Цена", "Сумма"].forEach((label) => {
      headRow.append(element("th", null, label));
    });
    head.append(headRow);

    const body = document.createElement("tbody");
    items.forEach((product) => {
      const row = document.createElement("tr");
      const name = document.createElement("td");
      name.append(document.createTextNode(display(product.lotProductName)));
      name.append(element("span", "procedure-detail-reference", `Лот ${product.lotNumber}`));
      row.append(
        name,
        element("td", null, display(product.lotKtruCode)),
        element("td", null, `${formatNumber(product.lotProductCount)} ${display(product.lotProductsOkeiName, "")}`.trim()),
        element("td", null, formatMoney(product.lotProductPrice, product.currency)),
        element("td", null, formatMoney(product.lotProductsSum, product.currency))
      );
      body.append(row);
    });
    table.append(head, body);
    scroll.append(table);
    wrapper.append(scroll);
    return wrapper;
  }

  function customers() {
    const items = tenders().flatMap((tender) => tender.customers || []);
    return uniqueBy(items, (customer) => [
      customer.lotCustomerInn,
      customer.lotCustomerKpp,
      customer.lotCustomerFullName
    ].join("|"));
  }

  function renderCustomers() {
    const items = customers();
    const wrapper = section("Заказчики", items.length);
    if (!items.length) {
      wrapper.append(empty("Сведения о заказчике не переданы источником"));
      return wrapper;
    }

    const list = element("div", "procedure-customer-list");
    items.forEach((customer) => {
      const customerNode = element("article", "procedure-customer");
      customerNode.append(element("h3", null, customer.lotCustomerFullName || customer.lotCustomerShortName || "Заказчик"));
      const grid = element("dl", "procedure-customer-grid");
      grid.append(
        detailItem("ИНН", customer.lotCustomerInn),
        detailItem("КПП", customer.lotCustomerKpp),
        detailItem("ОГРН", customer.lotCustomerOgrn),
        detailItem("Уровень организации", customer.customerOrganizationLevel),
        detailItem("Адрес", customer.lotCustomerAddress, "procedure-data-wide"),
        detailItem("Контакты", customer.lotCustomerContacts, "procedure-data-wide")
      );
      customerNode.append(grid);
      list.append(customerNode);
    });
    wrapper.append(list);
    return wrapper;
  }

  function renderDocuments() {
    const tenderItems = tenders();
    const total = tenderItems.reduce((sum, tender) => sum + (Number(tender.fileCount) || 0), 0);
    const wrapper = section("Документы", total);
    if (!total) {
      wrapper.append(empty("Документы не переданы источником"));
      return wrapper;
    }

    const list = element("div", "procedure-document-list");
    tenderItems.forEach((tender, index) => {
      if (!Number(tender.fileCount)) return;
      const row = element("div", "procedure-document-row");
      const text = document.createElement("div");
      text.append(element("h3", null, tender.lotName || tender.name || `Лот ${index + 1}`));
      const fact = element("dl", "procedure-document-fact");
      fact.append(detailItem("Файлов", tender.fileCount));
      text.append(fact);
      row.append(text);
      if (procedure.sourceUrl) {
        const link = element("a", "procedure-source-inline");
        link.href = procedure.sourceUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.append("Открыть источник", icon("external-link"));
        row.append(link);
      }
      list.append(row);
    });
    wrapper.append(list);
    return wrapper;
  }

  function events() {
    const items = tenders().flatMap((tender) => tender.events || []);
    return uniqueBy(items, (event) => event.id || `${event.date}|${event.name}`)
      .sort((left, right) => new Date(right.date) - new Date(left.date));
  }

  function renderHistory() {
    const items = events();
    const wrapper = section("История Tenderland", items.length);
    if (!items.length) {
      wrapper.append(empty("События не переданы источником"));
      return wrapper;
    }

    const timeline = element("div", "procedure-events");
    items.forEach((event) => {
      const node = element("article", "procedure-event");
      node.append(element("h3", null, event.name || "Изменение процедуры"));
      const time = element("time", null, formatDate(event.date, true));
      if (event.date) time.dateTime = event.date;
      node.append(time);
      timeline.append(node);
    });
    wrapper.append(timeline);
    return wrapper;
  }

  function workData() {
    return [
      ["Стадия", procedure.stage || "Без стадии"],
      ["Компания", "Не выбрана"],
      ["Ответственный", "Не назначен"],
      ["Следующее действие", "Не назначено"],
      ["Решение об участии", "Не принято"]
    ];
  }

  function renderWork(target, mobile = false) {
    target.replaceChildren();
    workData().forEach(([label, value]) => target.append(detailItem(label, value)));
    if (mobile) target.className = "procedure-work-mobile";
  }

  function renderWorkTab() {
    const wrapper = section("Работа с процедурой");
    const fields = document.createElement("dl");
    renderWork(fields, true);
    wrapper.append(fields);
    return wrapper;
  }

  function renderSourceData() {
    const wrapper = section("Все данные источника");
    const pre = element("pre", "procedure-source-data");
    pre.textContent = JSON.stringify(procedure.sourceData, null, 2);
    wrapper.append(pre);
    return wrapper;
  }

  function renderTab() {
    const views = {
      overview: renderOverview,
      products: renderProducts,
      customer: renderCustomers,
      documents: renderDocuments,
      history: renderHistory,
      source: renderSourceData,
      work: renderWorkTab
    };

    tabButtons.forEach((button) => {
      button.setAttribute("aria-selected", String(button.dataset.procedureTab === activeTab));
    });
    tabContent.replaceChildren(views[activeTab]());
    refreshIcons();
  }

  function renderHeader() {
    document.querySelector("[data-procedure-number]").textContent = procedure.registrationNumber || "Без реестрового номера";
    document.querySelector("[data-procedure-external-id]").textContent = procedure.externalId;
    document.querySelector("[data-procedure-title]").textContent = procedure.name;
    document.querySelector("[data-procedure-stage]").textContent = procedure.stage || "Без стадии";
    document.querySelector("[data-procedure-status]").textContent = procedure.status || "Статус не указан";
    document.title = `${procedure.name} — Kortex Capital`;
    renderKeyFacts();

    renderWork(workFields);
    document.querySelector("[data-procedure-sync-date]").textContent = formatDate(procedure.updatedAt, true);
    const sourceLink = document.querySelector("[data-procedure-source-link]");
    if (procedure.sourceUrl) sourceLink.href = procedure.sourceUrl;
  }

  function showError(message) {
    state.replaceChildren(
      element("strong", null, message),
      element("p", null, "Вернитесь к списку процедур и повторите попытку")
    );
  }

  async function loadProcedure() {
    try {
      const response = await fetch(`/api/procedures/${encodeURIComponent(procedureId)}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store"
      });

      if (response.status === 401) return;
      if (response.status === 404) {
        showError("Процедура не найдена");
        return;
      }
      if (!response.ok) throw new Error("PROCEDURE_LOAD_FAILED");

      const data = await response.json();
      procedure = data.procedure;
      renderHeader();
      renderTab();
      state.hidden = true;
      detailRoot.hidden = false;
      workSummary.hidden = false;
      refreshIcons();
    } catch {
      showError("Не удалось загрузить процедуру");
    }
  }

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      activeTab = button.dataset.procedureTab;
      renderTab();
    });
  });

  refreshIcons();
  loadProcedure();
})();
