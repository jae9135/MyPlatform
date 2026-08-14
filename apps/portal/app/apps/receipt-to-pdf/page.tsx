import { redirect } from "next/navigation";

/** iframe 없이 최상위 문서로 열어 휴대폰 카메라 권한을 안정적으로 요청한다. */
export default function ReceiptToPdfPage() {
  redirect("/receipt-to-pdf/index.html");
}
