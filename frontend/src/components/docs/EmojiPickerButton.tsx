import type { Editor } from "@tiptap/react";
import EmojiPicker, { type EmojiClickData } from "emoji-picker-react";
import { Smile } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Dropdown } from "@/components/common/Dropdown";
import { IconButton } from "@/components/common/IconButton";

export function EmojiPickerButton({ editor }: { editor: Editor }) {
  const { t } = useTranslation();

  function insertEmoji(data: EmojiClickData, close: () => void) {
    editor.chain().focus().insertContent(data.emoji).run();
    close();
  }

  return (
    <Dropdown
      trigger={({ toggle }) => (
        <IconButton
          icon={Smile}
          size="sm"
          aria-label={t("projects.overview.docs.toolbar.emoji")}
          title={t("projects.overview.docs.toolbar.emoji")}
          onClick={toggle}
        />
      )}
    >
      {({ close }) => (
        <EmojiPicker
          onEmojiClick={(data) => insertEmoji(data, close)}
          autoFocusSearch={false}
          width={320}
          height={380}
        />
      )}
    </Dropdown>
  );
}
