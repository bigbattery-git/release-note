import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-semibold tracking-wide text-blue-600">404</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">
          요청한 Release를 찾을 수 없습니다.
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          주소가 올바른지 확인하거나 최신 Release 목록으로 돌아가 주세요.
        </p>
        <Link href="/" className="mt-6 inline-flex rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700">
          최신 Release 보기
        </Link>
      </div>
    </main>
  );
}
