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
  let documents = [];
  let documentSummary = null;
  let documentCapabilities = null;
  let documentTotal = 0;
  let documentsLoaded = false;
  let documentsLoading = false;
  let documentMessage = "";
  let documentSearch = "";
  let documentSearchTimer = null;
  const DOCUMENT_PAGE_SIZE = 50;

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

  function formatBytes(value) {
    const bytes = Number(value);
    if (!Number.isFinite(bytes) || bytes < 0) return "Размер не указан";
    if (bytes < 1024) return `${bytes} Б`;
    const units = ["КБ", "МБ", "ГБ", "ТБ"];
    let size = bytes / 1024;
    let unit = units[0];
    for (let index = 1; index < units.length && size >= 1024; index += 1) {
      size /= 1024;
      unit = units[index];
    }
    return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(size)} ${unit}`;
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
    if (procedure.productPositions?.length) {
      return procedure.productPositions.map((position, index) => ({
        lotProductName: position.name,
        lotKtruCode: position.ktruCode,
        lotProductCount: position.quantity,
        lotProductsOkeiName: position.okeiName,
        lotProductPrice: position.unitPrice,
        lotProductsSum: position.totalPrice,
        currency: position.currency,
        lotNumber: 1,
        rowNumber: index + 1
      }));
    }

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

  function documentStatusLabel(status) {
    return {
      stored: "Сохранён",
      pending_upload: "Загружается",
      queued: "В очереди",
      downloading: "Загружается",
      external_only: "На источнике",
      metadata_only: "Только сведения",
      failed: "Ошибка",
      quarantined: "На проверке"
    }[status] || "Обрабатывается";
  }

  async function documentRequest(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers
      },
      cache: "no-store"
    });
    if (response.status === 401) throw new Error("AUTH_REQUIRED");
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const error = new Error(payload.message || payload.error || "FILE_REQUEST_FAILED");
      error.code = payload.error;
      throw error;
    }
    if (response.status === 204) return null;
    return response.json();
  }

  function rerenderDocuments() {
    if (activeTab === "documents") renderTab();
  }

  async function loadDocuments(reset = false) {
    if (documentsLoading) return;
    documentsLoading = true;
    if (reset) {
      documents = [];
      documentsLoaded = false;
    }
    rerenderDocuments();

    try {
      const offset = reset ? 0 : documents.length;
      const params = new URLSearchParams({
        limit: String(DOCUMENT_PAGE_SIZE),
        offset: String(offset)
      });
      if (documentSearch) params.set("q", documentSearch);
      const data = await documentRequest(
        `/api/procedures/${encodeURIComponent(procedureId)}/files?${params}`
      );
      documents = reset ? data.documents : [...documents, ...data.documents];
      documentSummary = data.summary;
      documentCapabilities = data.capabilities;
      documentTotal = data.pagination.total;
      documentsLoaded = true;
      documentMessage = "";
    } catch (error) {
      documentMessage = error.message === "AUTH_REQUIRED"
        ? "Сессия завершена"
        : "Не удалось загрузить документы";
    } finally {
      documentsLoading = false;
      rerenderDocuments();
    }
  }

  async function uploadDocument(file) {
    const created = await documentRequest(
      `/api/procedures/${encodeURIComponent(procedureId)}/files/uploads`,
      {
        method: "POST",
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType: file.type || "application/octet-stream"
        })
      }
    );
    let uploadResponse;
    try {
      uploadResponse = await fetch(created.upload.url, {
        method: "PUT",
        headers: created.upload.headers,
        body: file
      });
      if (!uploadResponse.ok) throw new Error("Не удалось передать файл в хранилище");
    } catch (error) {
      await documentRequest(
        `/api/procedures/${encodeURIComponent(procedureId)}/files/${created.document.id}`,
        { method: "DELETE" }
      ).catch(() => {});
      throw error;
    }
    await documentRequest(
      `/api/procedures/${encodeURIComponent(procedureId)}/files/${created.document.id}/complete`,
      { method: "POST" }
    );
  }

  async function uploadDocuments(files) {
    const selected = [...files];
    const maximum = Number(documentCapabilities?.maxUploadBytes || 0);
    const oversized = selected.find((file) => maximum && file.size > maximum);
    if (oversized) {
      documentMessage = `${oversized.name}: размер больше ${formatBytes(maximum)}`;
      rerenderDocuments();
      return;
    }

    try {
      for (let index = 0; index < selected.length; index += 1) {
        documentMessage = `Загрузка ${index + 1} из ${selected.length}: ${selected[index].name}`;
        rerenderDocuments();
        await uploadDocument(selected[index]);
      }
      await loadDocuments(true);
      documentMessage = selected.length > 1 ? `Загружено файлов: ${selected.length}` : "Файл загружен";
      rerenderDocuments();
    } catch (error) {
      documentMessage = error.code === "FILE_STORAGE_UNAVAILABLE"
        ? "Файловое хранилище пока не подключено"
        : error.message;
      rerenderDocuments();
    }
  }

  async function syncDocuments() {
    documentMessage = "Получаем список документов Tenderland";
    rerenderDocuments();
    try {
      const data = await documentRequest(
        `/api/procedures/${encodeURIComponent(procedureId)}/files/sync`,
        { method: "POST" }
      );
      await loadDocuments(true);
      documentMessage = `Получено: ${data.sync.total}, в очереди: ${data.sync.queued}`;
      rerenderDocuments();
    } catch (error) {
      documentMessage = error.code === "TENDERLAND_FILE_SYNC_FAILED"
        ? "Tenderland пока не даёт доступ к модулю файлов"
        : "Не удалось синхронизировать документы";
      rerenderDocuments();
    }
  }

  async function downloadDocument(documentItem) {
    try {
      const data = await documentRequest(
        `/api/procedures/${encodeURIComponent(procedureId)}/files/${documentItem.id}/download`
      );
      const link = document.createElement("a");
      link.href = data.url;
      if (data.external) {
        link.target = "_blank";
        link.rel = "noopener noreferrer";
      }
      document.body.append(link);
      link.click();
      link.remove();
    } catch {
      documentMessage = "Файл ещё не готов к скачиванию";
      rerenderDocuments();
    }
  }

  async function deleteDocument(documentItem) {
    if (!window.confirm(`Удалить «${documentItem.name}»?`)) return;
    try {
      await documentRequest(
        `/api/procedures/${encodeURIComponent(procedureId)}/files/${documentItem.id}`,
        { method: "DELETE" }
      );
      await loadDocuments(true);
      documentMessage = "Документ удалён";
      rerenderDocuments();
    } catch {
      documentMessage = "Не удалось удалить документ";
      rerenderDocuments();
    }
  }

  function documentAction(iconName, label, handler) {
    const button = element("button", "procedure-document-action");
    button.type = "button";
    button.title = label;
    button.setAttribute("aria-label", label);
    button.append(icon(iconName));
    button.addEventListener("click", handler);
    return button;
  }

  function renderDocumentRow(documentItem) {
    const row = element("article", "procedure-document-row");
    const fileIcon = element("span", "procedure-document-icon");
    fileIcon.append(icon("file-text"));
    const body = element("div", "procedure-document-body");
    body.append(element("h3", null, documentItem.name));
    const meta = element("div", "procedure-document-meta");
    meta.append(element("span", null, formatBytes(documentItem.sizeBytes)));
    if (documentItem.groupName) meta.append(element("span", null, documentItem.groupName));
    if (documentItem.version) meta.append(element("span", null, `Версия ${documentItem.version}`));
    if (documentItem.publishedAt) meta.append(element("span", null, formatDate(documentItem.publishedAt)));
    if (documentItem.source === "manual") meta.append(element("span", null, "Загружен вручную"));
    body.append(meta);

    const state = element("div", "procedure-document-state");
    const badge = element(
      "span",
      `procedure-document-status is-${documentItem.status}`,
      documentStatusLabel(documentItem.status)
    );
    state.append(badge);
    if (documentItem.isCurrent && documentItem.source === "tenderland") {
      state.append(element("span", "procedure-document-current", "Актуальная"));
    }

    const actions = element("div", "procedure-document-actions");
    if (documentItem.hasStoredFile || documentItem.hasExternalSource) {
      actions.append(documentAction("download", "Скачать", () => downloadDocument(documentItem)));
    }
    actions.append(documentAction("trash-2", "Удалить", () => deleteDocument(documentItem)));
    row.append(fileIcon, body, state, actions);
    return row;
  }

  function renderDocuments() {
    const sourceTotal = tenders().reduce((sum, tender) => sum + (Number(tender.fileCount) || 0), 0);
    const wrapper = section("Документы", documentsLoaded ? documentTotal : sourceTotal);
    const toolbar = element("div", "procedure-document-toolbar");
    const search = element("label", "procedure-document-search");
    search.append(icon("search"));
    const searchInput = document.createElement("input");
    searchInput.type = "search";
    searchInput.placeholder = "Поиск по документам";
    searchInput.value = documentSearch;
    searchInput.setAttribute("aria-label", "Поиск по документам");
    searchInput.addEventListener("input", () => {
      window.clearTimeout(documentSearchTimer);
      documentSearchTimer = window.setTimeout(() => {
        documentSearch = searchInput.value.trim();
        loadDocuments(true);
      }, 300);
    });
    search.append(searchInput);

    const commands = element("div", "procedure-document-commands");
    const syncButton = element("button", "procedure-document-command");
    syncButton.type = "button";
    syncButton.append(icon("refresh-cw"), element("span", null, "Синхронизировать"));
    syncButton.disabled = documentsLoading;
    syncButton.addEventListener("click", syncDocuments);

    const uploadInput = document.createElement("input");
    uploadInput.type = "file";
    uploadInput.multiple = true;
    uploadInput.hidden = true;
    uploadInput.addEventListener("change", () => uploadDocuments(uploadInput.files));
    const uploadButton = element("button", "procedure-document-command is-primary");
    uploadButton.type = "button";
    uploadButton.append(icon("upload"), element("span", null, "Загрузить"));
    uploadButton.disabled = documentsLoading || documentCapabilities?.storageConfigured === false;
    uploadButton.title = documentCapabilities?.storageConfigured === false
      ? "Файловое хранилище пока не подключено"
      : "Загрузить документы";
    uploadButton.addEventListener("click", () => uploadInput.click());
    commands.append(syncButton, uploadButton, uploadInput);
    toolbar.append(search, commands);
    wrapper.append(toolbar);

    if (documentSummary) {
      const summary = element("dl", "procedure-document-summary");
      summary.append(
        detailItem("Всего", documentSummary.total),
        detailItem("Сохранено", documentSummary.stored),
        detailItem("Обрабатывается", documentSummary.processing),
        detailItem("Объём", formatBytes(documentSummary.storedBytes))
      );
      wrapper.append(summary);
    }

    if (documentMessage) wrapper.append(element("p", "procedure-document-message", documentMessage));
    if (!documentsLoaded && !documentsLoading) {
      queueMicrotask(() => loadDocuments(true));
    }
    if (documentsLoading && !documents.length) {
      wrapper.append(element("p", "procedure-document-loading", "Загружаем документы"));
      return wrapper;
    }
    if (documentsLoaded && !documents.length) {
      wrapper.append(empty(documentSearch ? "Документы не найдены" : "Документов пока нет"));
      return wrapper;
    }

    const list = element("div", "procedure-document-list");
    documents.forEach((item) => list.append(renderDocumentRow(item)));
    wrapper.append(list);
    if (documents.length < documentTotal) {
      const more = element("button", "procedure-document-more", documentsLoading ? "Загрузка" : "Показать ещё");
      more.type = "button";
      more.disabled = documentsLoading;
      more.addEventListener("click", () => loadDocuments(false));
      wrapper.append(more);
    }
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
