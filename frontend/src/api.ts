export function token() {
  return sessionStorage.getItem("waraqa-token") || "";
}
export async function api<T = any>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch("/api" + path, {
    method,
    headers: {
      Authorization: `Bearer ${token()}`,
      ...(body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
    },
    ...(body === undefined
      ? {}
      : { body: body instanceof FormData ? body : JSON.stringify(body) }),
  });
  if (!response.ok) {
    let msg = "Erreur serveur",
      code = "";
    try {
      const data = await response.json();
      code = typeof data.code === "string" ? data.code : "";
      msg = Array.isArray(data.message)
        ? data.message.join(" · ")
        : data.message || msg;
    } catch {}
    if (response.status === 401) {
      sessionStorage.removeItem("waraqa-token");
      window.dispatchEvent(new Event("session-expired"));
    }
    throw Object.assign(new Error(msg), { status: response.status, code });
  }
  const text = await response.text();
  return (text ? JSON.parse(text) : null) as T;
}
export async function download(path: string, name: string) {
  const response = await fetch("/api" + path, {
    headers: { Authorization: `Bearer ${token()}` },
  });
  if (!response.ok) {
    let data;
    try {
      data = await response.json();
    } catch {}
    throw new Error(data?.message || "Téléchargement impossible.");
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export type Invoice = {
  id: number;
  version: number;
  creditOf?: number;
  accountingMonth?: string;
  fiscalMonth?: string;
  archivee?: boolean;
  or?: string;
  factNum?: string;
  designation?: string;
  mHt: number;
  tva: number;
  mTtc: number;
  iff?: string;
  libFrss?: string;
  iceFrs?: string;
  taux: number;
  idPaie?: number;
  datePaie?: string;
  dateFac?: string;
  sousType: string;
  statut: string;
  champsManquants?: string[];
  vigilanceRenforcee: boolean;
  revueHumaine: boolean;
  demonstration: boolean;
  doublonDe?: number;
  documentId?: string;
  rapprocheeA?: number;
  saisiPar?: string;
};
export type RecordItem = { id: string; data: any; updatedAt: string };
export const types: Record<string, string> = {
  facture_fournisseur: "Facture fournisseur",
  declaration_douaniere: "Déclaration douanière",
  quittance_douane: "Quittance douane",
  note_de_frais: "Note de frais",
  releve_bancaire: "Relevé bancaire",
  avis_debit_virement: "Avis de débit / virement",
};
export const payments: Record<string, string> = {
  "1": "Espèces",
  "2": "Chèque",
  "3": "Prélèvement",
  "4": "Virement",
  "5": "Effets",
  "6": "Compensation",
  "7": "Autres",
};
export function money(value: number) {
  return Number(value || 0).toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
export function bank(f: Invoice) {
  return (
    ["releve_bancaire", "avis_debit_virement"].includes(f.sousType) &&
    f.designation !== "COMMISSION"
  );
}
