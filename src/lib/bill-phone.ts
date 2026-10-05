// Which of Bill's numbers a customer sees. Facebook / Instagram ad leads get
// his cell (the number his voicemails and texts come from); contractors,
// campgrounds, commercial and everyone else get the office line.

export const AD_LEAD_PHONE = "(231) 384-0105";
export const OFFICE_PHONE = "(231) 944-6471";

export function billPhoneFor(source?: string | null): string {
  return source === "meta-ads" ? AD_LEAD_PHONE : OFFICE_PHONE;
}
