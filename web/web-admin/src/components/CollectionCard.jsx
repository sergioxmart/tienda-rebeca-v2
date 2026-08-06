// Tarjeta de colección para la grilla tipo Instagram.
// Portada: hero_image > mosaico de hasta 4 fotos de productos > placeholder.
// Ocultar y eliminar NO viven acá: solo dentro del modal de edición.

function Cover({ collection }) {
  const { hero_image: hero, name, preview_urls: previews } = collection;

  if (hero) {
    return <img className="coll-cover-img" src={hero} alt={name} loading="lazy" />;
  }

  const shots = (previews || []).slice(0, 4);
  if (shots.length > 0) {
    return (
      <div className={`coll-mosaic n${shots.length}`}>
        {shots.map((url, i) => (
          <img key={url + i} src={url} alt="" loading="lazy" />
        ))}
      </div>
    );
  }

  return (
    <div className="coll-cover-empty" aria-hidden="true">
      <span>Sin fotos</span>
    </div>
  );
}

export default function CollectionCard({ collection, onEdit, onMove, canMoveUp, canMoveDown, canEdit = true }) {
  const c = collection;
  return (
    <div className="coll-card">
      {canEdit ? (
        <button
          type="button"
          className="coll-cover"
          onClick={() => onEdit(c)}
          aria-label={`Editar ${c.name}`}
        >
          <Cover collection={c} />
          {!c.active && <span className="coll-badge">Oculta</span>}
        </button>
      ) : (
        <div className="coll-cover" aria-label={c.name}>
          <Cover collection={c} />
          {!c.active && <span className="coll-badge">Oculta</span>}
        </div>
      )}

      <div className="coll-meta">
        <span className="coll-accent" style={{ background: c.accent_color }} aria-hidden="true" />
        <div className="coll-name" title={c.name}>{c.name}</div>
      </div>

      {canEdit && (
        <div className="coll-actions">
          <div className="coll-order">
            <button
              className="row-btn"
              onClick={() => onMove(c, -1)}
              disabled={!canMoveUp}
              aria-label={`Mover "${c.name}" antes`}
            >←</button>
            <button
              className="row-btn"
              onClick={() => onMove(c, +1)}
              disabled={!canMoveDown}
              aria-label={`Mover "${c.name}" después`}
            >→</button>
          </div>
          <button className="row-btn" onClick={() => onEdit(c)}>Editar</button>
        </div>
      )}
    </div>
  );
}
