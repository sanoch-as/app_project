import type { HTMLAttributes } from "react";
import clsx from "clsx";

function CardRoot({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx("card", className)} {...props} />;
}

function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx("flex items-center justify-between border-b border-jira-border px-4 py-3", className)}
      {...props}
    />
  );
}

function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx("p-4", className)} {...props} />;
}

function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx("border-t border-jira-border px-4 py-3", className)} {...props} />
  );
}

export const Card = Object.assign(CardRoot, {
  Header: CardHeader,
  Body: CardBody,
  Footer: CardFooter,
});
