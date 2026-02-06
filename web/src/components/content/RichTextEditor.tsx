import React, { useRef, useEffect } from 'react';
import {
  Box,
  Paper,
  ToggleButton,
  ToggleButtonGroup,
  Divider,
  IconButton,
  Select,
  MenuItem,
  FormControl,
} from '@mui/material';
import {
  FormatBold,
  FormatItalic,
  FormatUnderlined,
  FormatListBulleted,
  FormatListNumbered,
  FormatQuote,
  Code,
  Link,
  Image,
  FormatAlignLeft,
  FormatAlignCenter,
  FormatAlignRight,
  Undo,
  Redo,
} from '@mui/icons-material';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export const RichTextEditor: React.FC<RichTextEditorProps> = ({
  value,
  onChange,
  placeholder = 'Start writing...',
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const [alignment, setAlignment] = React.useState<string>('left');
  const [fontSize, setFontSize] = React.useState<string>('16');

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value;
    }
  }, [value]);

  const handleCommand = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    handleContentChange();
  };

  const handleContentChange = () => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  const handleAlignment = (event: React.MouseEvent<HTMLElement>, newAlignment: string | null) => {
    if (newAlignment !== null) {
      setAlignment(newAlignment);
      handleCommand(`justify${newAlignment.charAt(0).toUpperCase() + newAlignment.slice(1)}`);
    }
  };

  const handleFontSizeChange = (event: any) => {
    const size = event.target.value;
    setFontSize(size);
    handleCommand('fontSize', getFontSizeValue(size));
  };

  const getFontSizeValue = (size: string) => {
    const sizeMap: { [key: string]: string } = {
      '12': '1',
      '14': '2',
      '16': '3',
      '18': '4',
      '24': '5',
      '32': '6',
      '48': '7',
    };
    return sizeMap[size] || '3';
  };

  const insertLink = () => {
    const url = prompt('Enter URL:');
    if (url) {
      handleCommand('createLink', url);
    }
  };

  const insertImage = () => {
    const url = prompt('Enter image URL:');
    if (url) {
      handleCommand('insertImage', url);
    }
  };

  return (
    <Box>
      <Paper
        variant="outlined"
        sx={{
          mb: 2,
          p: 1,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 1,
        }}
      >
        {/* Text Style */}
        <ToggleButtonGroup size="small">
          <ToggleButton
            value="bold"
            onClick={() => handleCommand('bold')}
            aria-label="bold"
          >
            <FormatBold />
          </ToggleButton>
          <ToggleButton
            value="italic"
            onClick={() => handleCommand('italic')}
            aria-label="italic"
          >
            <FormatItalic />
          </ToggleButton>
          <ToggleButton
            value="underline"
            onClick={() => handleCommand('underline')}
            aria-label="underline"
          >
            <FormatUnderlined />
          </ToggleButton>
        </ToggleButtonGroup>

        <Divider orientation="vertical" flexItem />

        {/* Font Size */}
        <FormControl size="small" sx={{ minWidth: 80 }}>
          <Select
            value={fontSize}
            onChange={handleFontSizeChange}
            displayEmpty
          >
            <MenuItem value="12">12px</MenuItem>
            <MenuItem value="14">14px</MenuItem>
            <MenuItem value="16">16px</MenuItem>
            <MenuItem value="18">18px</MenuItem>
            <MenuItem value="24">24px</MenuItem>
            <MenuItem value="32">32px</MenuItem>
            <MenuItem value="48">48px</MenuItem>
          </Select>
        </FormControl>

        <Divider orientation="vertical" flexItem />

        {/* Alignment */}
        <ToggleButtonGroup
          value={alignment}
          exclusive
          onChange={handleAlignment}
          size="small"
        >
          <ToggleButton value="left" aria-label="left align">
            <FormatAlignLeft />
          </ToggleButton>
          <ToggleButton value="center" aria-label="center align">
            <FormatAlignCenter />
          </ToggleButton>
          <ToggleButton value="right" aria-label="right align">
            <FormatAlignRight />
          </ToggleButton>
        </ToggleButtonGroup>

        <Divider orientation="vertical" flexItem />

        {/* Lists */}
        <ToggleButtonGroup size="small">
          <ToggleButton
            value="bullet"
            onClick={() => handleCommand('insertUnorderedList')}
            aria-label="bullet list"
          >
            <FormatListBulleted />
          </ToggleButton>
          <ToggleButton
            value="number"
            onClick={() => handleCommand('insertOrderedList')}
            aria-label="numbered list"
          >
            <FormatListNumbered />
          </ToggleButton>
        </ToggleButtonGroup>

        <Divider orientation="vertical" flexItem />

        {/* Other */}
        <IconButton
          size="small"
          onClick={() => handleCommand('formatBlock', '<blockquote>')}
          aria-label="quote"
        >
          <FormatQuote />
        </IconButton>
        <IconButton
          size="small"
          onClick={() => handleCommand('formatBlock', '<pre>')}
          aria-label="code"
        >
          <Code />
        </IconButton>
        <IconButton
          size="small"
          onClick={insertLink}
          aria-label="link"
        >
          <Link />
        </IconButton>
        <IconButton
          size="small"
          onClick={insertImage}
          aria-label="image"
        >
          <Image />
        </IconButton>

        <Divider orientation="vertical" flexItem />

        {/* Undo/Redo */}
        <IconButton
          size="small"
          onClick={() => handleCommand('undo')}
          aria-label="undo"
        >
          <Undo />
        </IconButton>
        <IconButton
          size="small"
          onClick={() => handleCommand('redo')}
          aria-label="redo"
        >
          <Redo />
        </IconButton>
      </Paper>

      <Paper
        variant="outlined"
        sx={{
          p: 2,
          minHeight: 400,
          '& [contenteditable]': {
            outline: 'none',
            minHeight: 380,
            '&:empty:before': {
              content: `"${placeholder}"`,
              color: 'text.secondary',
              fontStyle: 'italic',
            },
          },
        }}
      >
        <div
          ref={editorRef}
          contentEditable
          onInput={handleContentChange}
          style={{
            fontSize: `${fontSize}px`,
            lineHeight: 1.6,
          }}
        />
      </Paper>
    </Box>
  );
};