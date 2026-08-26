"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function enhanceTables() {
  const tables = document.querySelectorAll<HTMLTableElement>(".table-wrap table");

  tables.forEach((table) => {
    table.classList.add("responsive-table");
    const headers = Array.from(table.querySelectorAll<HTMLTableCellElement>("thead th")).map((th) => th.textContent?.trim() ?? "");

    table.querySelectorAll<HTMLTableRowElement>("tbody tr").forEach((row) => {
      const cells = Array.from(row.children).filter((child): child is HTMLTableCellElement => child instanceof HTMLTableCellElement);
      cells.forEach((cell, index) => {
        if (cell.hasAttribute("colspan")) {
          cell.dataset.label = "";
          return;
        }
        cell.dataset.label = headers[index] ?? "";
      });
    });
  });
}

export function ResponsiveEnhancer() {
  const pathname = usePathname();

  useEffect(() => {
    let frame = requestAnimationFrame(enhanceTables);
    const content = document.querySelector(".content");
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(enhanceTables);
    });

    if (content) observer.observe(content, { childList: true, subtree: true });

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [pathname]);

  return null;
}
