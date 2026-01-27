export interface Attachment {
  id: string;
  path: string;
  title?: string;
  linkedProjectId?: string;
  timestamp: number;
}

interface AttachmentWithStatus extends Attachment {
  exists: boolean;
  thumbnailData?: string;
}

class AttachmentPanel {
  private element: HTMLElement;
  private isVisible = false;
  private attachments: AttachmentWithStatus[] = [];
  private selectedIndex = 0;
  private imageModal: HTMLElement | null = null;

  constructor() {
    this.element = this.createPanelElement();
    document.body.appendChild(this.element);
    this.setupEventListeners();
  }

  private createPanelElement(): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'attachment-panel';
    panel.innerHTML = `
      <div class="attachment-panel-backdrop"></div>
      <div class="attachment-panel-container">
        <div class="attachment-panel-header">
          <h2 class="attachment-panel-title">Image Attachments</h2>
          <div class="attachment-panel-actions">
            <button class="attachment-add-btn" title="Add Image">+ Add Image</button>
            <button class="attachment-panel-close">&times;</button>
          </div>
        </div>
        <div class="attachment-drop-zone">
          <div class="attachment-grid"></div>
          <div class="attachment-drop-overlay">
            <span>Drop images here</span>
          </div>
        </div>
        <div class="attachment-hint">Click to view | Hover for actions | Drag & drop to add | Delete removes from list only</div>
      </div>
    `;
    return panel;
  }

  private setupEventListeners(): void {
    this.element.querySelector('.attachment-panel-backdrop')?.addEventListener('click', () => {
      this.hide();
    });

    this.element.querySelector('.attachment-panel-close')?.addEventListener('click', () => {
      this.hide();
    });

    this.element.querySelector('.attachment-add-btn')?.addEventListener('click', () => {
      this.addImageFromDialog();
    });

    // Drag and drop support
    const dropZone = this.element.querySelector('.attachment-drop-zone') as HTMLElement;

    dropZone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add('drag-over');
    });

    dropZone?.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('drag-over');
    });

    dropZone?.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('drag-over');

      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          // Check if it's an image file
          if (file.type.startsWith('image/')) {
            const filePath = window.electronAPI.getPathForFile(file);
            if (filePath) {
              await window.electronAPI.addAttachment(filePath);
            }
          }
        }
        await this.loadAttachments();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isVisible) {
        if (this.imageModal) {
          this.closeImageModal();
        } else {
          this.hide();
        }
        e.preventDefault();
      }
    });
  }

  private async addImageFromDialog(): Promise<void> {
    try {
      const result = await window.electronAPI.selectImage();
      if (result && result.filePath) {
        const title = prompt('Enter a title for this image (optional):', '');
        await window.electronAPI.addAttachment(result.filePath, title || undefined);
        await this.loadAttachments();
      }
    } catch (error) {
      console.error('Failed to add image:', error);
    }
  }

  private async loadAttachments(): Promise<void> {
    try {
      const attachments = await window.electronAPI.getAttachments();
      this.attachments = [];

      for (const attachment of attachments) {
        const exists = await window.electronAPI.checkFileExists(attachment.path);
        let thumbnailData: string | undefined;

        if (exists) {
          const data = await window.electronAPI.readImageAsBase64(attachment.path);
          thumbnailData = data ?? undefined;
        }

        this.attachments.push({
          ...attachment,
          exists,
          thumbnailData,
        });
      }

      this.renderGrid();
    } catch (error) {
      console.error('Failed to load attachments:', error);
    }
  }

  private renderGrid(): void {
    const grid = this.element.querySelector('.attachment-grid') as HTMLElement;
    grid.innerHTML = '';

    if (this.attachments.length === 0) {
      grid.innerHTML = `
        <div class="attachment-empty">
          No images attached yet. Click "Add Image" to attach your first image.
        </div>
      `;
      return;
    }

    this.attachments.forEach((attachment, index) => {
      const item = document.createElement('div');
      item.className = `attachment-item ${!attachment.exists ? 'missing' : ''}`;
      item.dataset.index = String(index);

      const thumbnailContent = attachment.exists && attachment.thumbnailData
        ? `<img src="${attachment.thumbnailData}" alt="${this.escapeHtml(attachment.title || 'Image')}" />`
        : `<div class="attachment-missing-icon">
            <span class="warning-icon">!</span>
            <span class="missing-text">File not found</span>
          </div>`;

      item.innerHTML = `
        <div class="attachment-thumbnail">
          ${thumbnailContent}
        </div>
        <div class="attachment-info">
          <span class="attachment-title">${this.escapeHtml(attachment.title || this.getFileName(attachment.path))}</span>
          <span class="attachment-path" title="${this.escapeHtml(attachment.path)}">${this.escapeHtml(this.truncatePath(attachment.path))}</span>
        </div>
        <div class="attachment-actions">
          <button class="attachment-edit-btn" title="Edit Title">Edit</button>
          <button class="attachment-delete-btn" title="Delete">Delete</button>
        </div>
      `;

      if (attachment.exists) {
        item.addEventListener('click', (e) => {
          if (!(e.target as HTMLElement).closest('.attachment-actions')) {
            this.showImageModal(attachment);
          }
        });
      }

      item.querySelector('.attachment-edit-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.editAttachment(attachment);
      });

      item.querySelector('.attachment-delete-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteAttachment(attachment);
      });

      grid.appendChild(item);
    });
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private getFileName(filePath: string): string {
    return filePath.split(/[/\\]/).pop() || filePath;
  }

  private truncatePath(filePath: string, maxLength: number = 40): string {
    if (filePath.length <= maxLength) return filePath;
    const fileName = this.getFileName(filePath);
    if (fileName.length >= maxLength - 3) {
      return '...' + fileName.slice(-maxLength + 3);
    }
    return '...' + filePath.slice(-maxLength + 3);
  }

  private showImageModal(attachment: AttachmentWithStatus): void {
    if (!attachment.thumbnailData) return;

    this.imageModal = document.createElement('div');
    this.imageModal.className = 'attachment-image-modal';
    this.imageModal.innerHTML = `
      <div class="attachment-image-modal-backdrop"></div>
      <div class="attachment-image-modal-content">
        <img src="${attachment.thumbnailData}" alt="${this.escapeHtml(attachment.title || 'Image')}" />
        <div class="attachment-image-modal-title">${this.escapeHtml(attachment.title || this.getFileName(attachment.path))}</div>
        <button class="attachment-image-modal-close">&times;</button>
      </div>
    `;

    this.imageModal.querySelector('.attachment-image-modal-backdrop')?.addEventListener('click', () => {
      this.closeImageModal();
    });

    this.imageModal.querySelector('.attachment-image-modal-close')?.addEventListener('click', () => {
      this.closeImageModal();
    });

    document.body.appendChild(this.imageModal);
  }

  private closeImageModal(): void {
    if (this.imageModal) {
      this.imageModal.remove();
      this.imageModal = null;
    }
  }

  private async editAttachment(attachment: AttachmentWithStatus): Promise<void> {
    const newTitle = prompt('Enter new title:', attachment.title || '');
    if (newTitle !== null) {
      try {
        await window.electronAPI.updateAttachment(attachment.id, { title: newTitle || undefined });
        await this.loadAttachments();
      } catch (error) {
        console.error('Failed to update attachment:', error);
      }
    }
  }

  private async deleteAttachment(attachment: AttachmentWithStatus): Promise<void> {
    const confirmed = confirm(`Delete "${attachment.title || this.getFileName(attachment.path)}" from attachments?\n\nNote: This only removes from the list, the original file will not be deleted.`);
    if (confirmed) {
      try {
        await window.electronAPI.removeAttachment(attachment.id);
        await this.loadAttachments();
      } catch (error) {
        console.error('Failed to delete attachment:', error);
      }
    }
  }

  async show(): Promise<void> {
    this.isVisible = true;
    this.element.classList.add('visible');
    await this.loadAttachments();
  }

  hide(): void {
    this.isVisible = false;
    this.element.classList.remove('visible');
    this.closeImageModal();
  }

  toggle(): void {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  get visible(): boolean {
    return this.isVisible;
  }
}

export const attachmentPanel = new AttachmentPanel();
