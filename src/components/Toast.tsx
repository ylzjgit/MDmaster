interface ToastProps {
  message: string;
  kind: "info" | "success" | "error";
}

export function Toast({ message, kind }: ToastProps) {
  return (
    <div className={"toast toast-" + kind} role="status">
      {message}
    </div>
  );
}
