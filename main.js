/* =========================================================================
   FLIGHT LOG → CSV
   -------------------------------------------------------------------------
   A single-file, dependency-free tool to hand-enter past flights and export
   a CSV that flight-tracker apps (targeting Flighty's format) can import.

   >>> THE ONE THING TO VERIFY BEFORE TRUSTING THIS <<<
   The importing app almost certainly identifies the source format by the
   header row. FLIGHTY_HEADER below is my best reconstruction, NOT a value
   confirmed against a real export. Before relying on this:
     1. Get one real `FlightyExport-*.csv`.
     2. Diff its first line against FLIGHTY_HEADER.
     3. Fix column names / order / count here if they differ.
   Everything else in this file is mechanical and low-risk; this constant
   is where an import will succeed or fail.
   ========================================================================= */

/* ---- Format profiles --------------------------------------------------- */

// Full Flighty header (reconstructed — VERIFY, see note above).
const FLIGHTY_HEADER = [
  "Date",
  "Airline",
  "Flight",
  "From",
  "To",
  "Dep Terminal",
  "Dep Gate",
  "Arr Terminal",
  "Arr Gate",
  "Canceled",
  "Diverted To",
  "Gate Departure (Scheduled)",
  "Gate Departure (Actual)",
  "Take off (Scheduled)",
  "Take off (Actual)",
  "Landing (Scheduled)",
  "Landing (Actual)",
  "Gate Arrival (Scheduled)",
  "Gate Arrival (Actual)",
  "Aircraft Type Name",
  "Tail Number",
  "PNR",
  "Seat",
  "Seat Type",
  "Cabin Class",
  "Flight Reason",
  "Notes",
];

// A Flighty datetime looks like YYYY-MM-DDTHH:MM (no seconds/offset here —
// timezone handling is a KNOWN GAP; times are treated as local wall-clock).
function dt(date, time) {
  if (!date) return "";
  return time ? `${date}T${time}` : "";
}

const PROFILES = {
  flighty: {
    label: "Flighty",
    header: FLIGHTY_HEADER,
    row(f) {
      const dep = dt(f.date, f.dep);
      const arr = dt(f.date, f.arr);
      return [
        f.date,
        f.airline,
        f.flight,
        f.from,
        f.to,
        "",
        "",
        "",
        "", // terminals / gates (not captured)
        f.canceled ? "Yes" : "",
        "", // Canceled, Diverted To
        dep,
        dep, // gate departure sched/actual
        dep,
        dep, // take off sched/actual
        arr,
        arr, // landing sched/actual
        arr,
        arr, // gate arrival sched/actual
        f.aircraft,
        f.tail,
        f.pnr,
        f.seat,
        "",
        f.cabin,
        "",
        f.notes,
      ];
    },
  },
  // Safest fallback if the full header is ever rejected: emit only the
  // core identifying columns. Many importers accept a subset.
  "flighty-min": {
    label: "Flighty (core)",
    header: ["Date", "Airline", "Flight", "From", "To", "Canceled", "Notes"],
    row(f) {
      return [
        f.date,
        f.airline,
        f.flight,
        f.from,
        f.to,
        f.canceled ? "Yes" : "",
        f.notes,
      ];
    },
  },
};

/* ---- State (in-memory is source of truth; localStorage is best-effort) -- */

const LS_KEY = "flightlog.v1";
let flights = loadLocal();

function loadLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  } // storage unavailable (e.g. sandboxed preview) — degrade quietly
}
function saveLocal() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(flights));
  } catch (_) {}
}

/* ---- DOM helpers ------------------------------------------------------- */

const $ = (id) => document.getElementById(id);
const FIELDS = [
  "date",
  "airline",
  "flight",
  "from",
  "to",
  "dep",
  "arr",
  "seat",
  "cabin",
  "aircraft",
  "tail",
  "pnr",
  "notes",
  "canceled",
];

function readForm() {
  const f = {};
  for (const k of FIELDS) f[k] = $(k).value.trim();
  // normalize codes to uppercase
  ["airline", "flight", "from", "to", "seat", "tail", "pnr"].forEach(
    (k) => (f[k] = f[k].toUpperCase()),
  );
  return f;
}

function validate(f) {
  const errs = [];
  if (!f.date) errs.push("date");
  if (!f.airline) errs.push("airline");
  if (!f.flight) errs.push("flight");
  if (!/^[A-Z]{3,4}$/.test(f.from)) errs.push("valid From (3–4 letters)");
  if (!/^[A-Z]{3,4}$/.test(f.to)) errs.push("valid To (3–4 letters)");
  return errs;
}

function clearForm() {
  for (const k of FIELDS) $(k).value = "";
  $("formErr").textContent = "";
  $("date").focus();
}

/* ---- Render ------------------------------------------------------------ */

function render() {
  const tbody = $("rows");
  tbody.innerHTML = "";
  $("empty").style.display = flights.length ? "none" : "block";
  $("count").textContent =
    `${flights.length} flight${flights.length === 1 ? "" : "s"}`;

  flights.forEach((f, i) => {
    const tr = document.createElement("tr");
    const cell = (txt, cls) => {
      const td = document.createElement("td");
      if (cls) td.className = cls;
      td.textContent = txt || "";
      return td;
    };
    tr.appendChild(cell(f.date));
    tr.appendChild(cell(`${f.from}→${f.to}`, "leg mono"));
    tr.appendChild(cell(`${f.airline}${f.flight}`, "mono"));
    tr.appendChild(cell(f.dep, "mono"));
    tr.appendChild(cell(f.arr, "mono"));
    tr.appendChild(cell(f.seat, "mono"));
    tr.appendChild(cell(f.cabin));
    tr.appendChild(cell(f.aircraft));
    const del = document.createElement("td");
    const btn = document.createElement("button");
    btn.className = "x";
    btn.textContent = "✕";
    btn.title = "Remove";
    btn.onclick = () => {
      flights.splice(i, 1);
      saveLocal();
      render();
    };
    del.appendChild(btn);
    tr.appendChild(del);
    if (f.canceled) tr.classList.add("canceled");
    tbody.appendChild(tr);
  });
}

/* ---- CSV --------------------------------------------------------------- */

function csvCell(v) {
  v = v == null ? "" : String(v);
  return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}
function toCsv(profile) {
  const lines = [profile.header.map(csvCell).join(",")];
  for (const f of flights) lines.push(profile.row(f).map(csvCell).join(","));
  return lines.join("\r\n"); // CRLF — safest for spreadsheet/importer compatibility
}
function download(filename, text, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ---- Format note / schema line ---------------------------------------- */

function updateFormatNote() {
  const key = $("format").value;
  const p = PROFILES[key];
  $("schemaLine").innerHTML =
    "Header emitted: <code>" + p.header.join(", ") + "</code>";
  if (key === "flighty") {
    $("formatNote").innerHTML =
      "Full Flighty schema. <strong>Verify the header</strong> against a real FlightyExport before trusting the import — that row is how the app detects the format.";
  } else {
    $("formatNote").innerHTML =
      "Only the core identifying columns. Use this if the full header gets rejected.";
  }
}

/* ---- Wire up ----------------------------------------------------------- */

$("add").onclick = () => {
  const f = readForm();
  const errs = validate(f);
  if (errs.length) {
    $("formErr").textContent = "Need: " + errs.join(", ");
    return;
  }
  flights.push(f);
  saveLocal();
  render();
  clearForm();
};

// Enter anywhere in the form adds the flight
$("date")
  .closest(".entry")
  .addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.tagName !== "BUTTON") {
      e.preventDefault();
      $("add").click();
    }
  });

$("clearForm").onclick = clearForm;

$("exportCsv").onclick = () => {
  if (!flights.length) {
    $("formErr").textContent = "No flights to export.";
    return;
  }
  const key = $("format").value;
  const stamp = new Date().toISOString().slice(0, 10);
  download(
    `flights-${key}-${stamp}.csv`,
    toCsv(PROFILES[key]),
    "text/csv;charset=utf-8",
  );
};

$("saveJson").onclick = () => {
  download(
    `flights-backup-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify(flights, null, 2),
    "application/json",
  );
};

$("loadJson").onclick = () => $("jsonFile").click();
$("jsonFile").onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data)) throw new Error("not an array");
      flights = data;
      saveLocal();
      render();
    } catch (err) {
      $("formErr").textContent = "Couldn't read that backup file.";
    }
  };
  reader.readAsText(file);
  e.target.value = "";
};

$("wipe").onclick = () => {
  if (
    flights.length &&
    confirm(`Delete all ${flights.length} flights? This can't be undone.`)
  ) {
    flights = [];
    saveLocal();
    render();
  }
};

$("format").onchange = updateFormatNote;

// init
render();
updateFormatNote();
$("date").focus();
