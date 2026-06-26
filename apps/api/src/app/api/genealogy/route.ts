import { NextResponse } from 'next/server';
import { deleteGenealogyData } from '@greencity/db';

export async function DELETE(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (body.confirm !== 'DELETE') {
    return NextResponse.json({ error: 'confirm: DELETE required' }, { status: 400 });
  }
  const deleted = await deleteGenealogyData();
  return NextResponse.json({ ok: true, deleted });
}
