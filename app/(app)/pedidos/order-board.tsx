"use client";

import {
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";
import type { BoardOrder, SpoolOption } from "@/lib/order-loaders";
import { BOARD_STATUSES, type BoardStatus, ORDER_STATUS_LABEL } from "@/lib/orders";
import { cn } from "@/lib/utils";
import { OrderCard } from "./order-card";
import { useOrderMove } from "./use-order-move";

type Columns = Record<BoardStatus, BoardOrder[]>;

const group = (orders: BoardOrder[]): Columns =>
  Object.fromEntries(BOARD_STATUSES.map((s) => [s, orders.filter((o) => o.status === s)])) as Columns;

/**
 * Quadro de pedidos. Desktop: arrastar entre colunas (mouse, toque ou teclado).
 * Celular: uma coluna por vez, em abas, e "Mover para…" em cada card.
 * O servidor recria o quadro (key) depois de cada mudança; o estado local só cobre o arraste.
 */
export function OrderBoard({ orders, spools }: { orders: BoardOrder[]; spools: SpoolOption[] }) {
  const [columns, setColumns] = useState<Columns>(() => group(orders));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [origin, setOrigin] = useState<BoardStatus | null>(null);
  const [mobileColumn, setMobileColumn] = useState<BoardStatus>(() => (orders.some((o) => o.status === "queued") ? "queued" : "awaiting_payment"));
  const { request, dialog } = useOrderMove(spools);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const findColumn = (id: string): BoardStatus | null =>
    (BOARD_STATUSES as readonly string[]).includes(id)
      ? (id as BoardStatus)
      : (BOARD_STATUSES.find((s) => columns[s].some((o) => o.id === id)) ?? null);
  const active = activeId ? orders.find((o) => o.id === activeId) : undefined;

  function onDragStart({ active }: DragStartEvent) {
    setActiveId(String(active.id));
    setOrigin(findColumn(String(active.id)));
  }

  // atravessar colunas durante o arraste (lista de destino recebe o card)
  function onDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    const from = findColumn(String(active.id));
    const to = findColumn(String(over.id));
    if (!from || !to || from === to) return;
    setColumns((cols) => {
      const card = cols[from].find((o) => o.id === active.id);
      if (!card) return cols;
      const overIndex = cols[to].findIndex((o) => o.id === over.id);
      const target = [...cols[to]];
      target.splice(overIndex >= 0 ? overIndex : target.length, 0, card);
      return { ...cols, [from]: cols[from].filter((o) => o.id !== active.id), [to]: target };
    });
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    const id = String(active.id);
    setActiveId(null);
    const to = over ? findColumn(String(over.id)) : null;
    if (!to || !origin) {
      setColumns(group(orders));
      return;
    }
    const list = columns[to];
    const oldIndex = list.findIndex((o) => o.id === id);
    const overIndex = list.findIndex((o) => o.id === over?.id);
    const reordered = overIndex >= 0 && oldIndex !== overIndex ? arrayMove(list, oldIndex, overIndex) : list;
    setColumns((cols) => ({ ...cols, [to]: reordered }));
    const order = orders.find((o) => o.id === id);
    if (!order) return;
    const changedColumn = to !== origin;
    if (changedColumn || oldIndex !== overIndex) request(order, to, reordered.map((o) => o.id));
  }

  return (
    <>
      {dialog}

      {/* Celular: abas por coluna */}
      <div className="grid gap-3 md:hidden">
        <nav aria-label="Colunas" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {BOARD_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setMobileColumn(s)}
              aria-pressed={s === mobileColumn}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1 text-sm whitespace-nowrap transition-colors",
                s === mobileColumn ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
              )}
            >
              {ORDER_STATUS_LABEL[s]} <span className="tabular-nums opacity-70">{columns[s].length}</span>
            </button>
          ))}
        </nav>
        {columns[mobileColumn].length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhum pedido nesta coluna.</p>
        ) : (
          columns[mobileColumn].map((o) => <OrderCard key={o.id} order={o} onMove={(t) => request(o, t)} />)
        )}
      </div>

      {/* Desktop: quadro com arrastar */}
      {/* id fixo: sem ele o dnd-kit gera ids de acessibilidade diferentes no servidor e no navegador (hidratação) */}
      <DndContext
        id="quadro-pedidos"
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setActiveId(null);
          setColumns(group(orders));
        }}
        accessibility={{
          screenReaderInstructions: {
            draggable: "Para mover, pressione espaço, use as setas e pressione espaço de novo. Esc cancela.",
          },
        }}
      >
        <div className="hidden gap-3 overflow-x-auto pb-2 md:flex">
          {BOARD_STATUSES.map((s) => (
            <Column key={s} status={s} orders={columns[s]} activeId={activeId} onMove={request} />
          ))}
        </div>
        <DragOverlay>{active && <OrderCard order={active} onMove={() => {}} className="w-64 rotate-1 shadow-xl" />}</DragOverlay>
      </DndContext>
    </>
  );
}

function Column({
  status,
  orders,
  activeId,
  onMove,
}: {
  status: BoardStatus;
  orders: BoardOrder[];
  activeId: string | null;
  onMove: (order: BoardOrder, target: BoardStatus) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section
      aria-label={ORDER_STATUS_LABEL[status]}
      className={cn("flex w-64 shrink-0 flex-col gap-2 rounded-xl bg-muted/40 p-2", isOver && "ring-2 ring-ring/60")}
    >
      <h2 className="flex items-center justify-between px-1 pt-1 text-sm font-medium">
        {ORDER_STATUS_LABEL[status]}
        <span className="text-xs text-muted-foreground tabular-nums">{orders.length}</span>
      </h2>
      <SortableContext id={status} items={orders.map((o) => o.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="flex min-h-24 flex-col gap-2">
          {orders.map((o) => (
            <SortableCard key={o.id} order={o} dragging={o.id === activeId} onMove={(t) => onMove(o, t)} />
          ))}
        </div>
      </SortableContext>
    </section>
  );
}

function SortableCard({ order, dragging, onMove }: { order: BoardOrder; dragging: boolean; onMove: (t: BoardStatus) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: order.id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} {...attributes} {...listeners}>
      <OrderCard order={order} onMove={onMove} dragging={dragging} />
    </div>
  );
}
