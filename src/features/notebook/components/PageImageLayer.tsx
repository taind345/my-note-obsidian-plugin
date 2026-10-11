import React from 'react'
import { Lock } from 'lucide-react'
import type { PageImageData } from '@/shared/types/notebook'
import { PAGE_WIDTH, PAGE_HEIGHT } from '@/shared/lib/lineSnap'

interface PageImageLayerProps {
  pageId: string
  images: PageImageData[]
}

/**
 * Layer hiển thị ảnh paste — thuần presentational, NẰM DƯỚI layer nét vẽ
 * và textbox nên chữ + nét vẽ luôn đè lên ảnh.
 * Mọi tương tác (click chọn, kéo di chuyển, resize, chuột phải layer, Delete)
 * đều do PageCanvas (nằm trên) đảm nhiệm qua hit-test.
 */
function PageImageLayerInner({ pageId: _pageId, images }: PageImageLayerProps) {
  void _pageId
  return (
    <div
      className="page-image-layer"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: `${PAGE_WIDTH}px`,
        height: `${PAGE_HEIGHT}px`,
        zIndex: 3,
        pointerEvents: 'none',
      }}
    >
      {images.map((img) => (
        <div
          key={img.id}
          className={`page-pasted-image ${img.showFrame ? 'is-framed' : ''}`}
          style={{
            position: 'absolute',
            left: `${img.x}px`,
            top: `${img.y}px`,
            width: `${img.width}px`,
            height: `${img.height}px`,
            pointerEvents: 'none',
            overflow: 'visible',
            userSelect: 'none',
          }}
          title={img.name || 'pasted image'}
        >
          <img
            src={img.src}
            alt={img.name || 'pasted image'}
            draggable={false}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'fill',
              borderRadius: '5px',
              display: 'block',
              pointerEvents: 'none',
            }}
          />
          {img.isLocked && (
            <div
              className="pasted-image-lock-badge"
              style={{
                position: 'absolute',
                top: '4px',
                left: '4px',
                background: 'rgba(15,23,42,0.72)',
                color: '#fff',
                borderRadius: '4px',
                padding: '2px 4px',
                display: 'flex',
                alignItems: 'center',
              }}
              title="Ảnh đã khóa"
            >
              <Lock size={11} />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export const PageImageLayer = React.memo(
  PageImageLayerInner,
  (prev, next) => prev.pageId === next.pageId && prev.images === next.images
)
