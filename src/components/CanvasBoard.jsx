import React, { useRef, useEffect, useState } from 'react';
import { Pencil, Eraser, Trash2, Square, Circle, Minus, Type, Undo2 } from 'lucide-react';
import { motion } from 'framer-motion';

const CanvasBoard = () => {
  const canvasRef = useRef(null);
  const contextRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState('pencil');
  const [color, setColor] = useState('#000000');
  const [lineWidth, setLineWidth] = useState(3);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [snapshot, setSnapshot] = useState(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const updateSize = () => {
      const parent = canvas.parentElement;
      if (parent) {
        // Save current drawing
        const tempImage = canvas.toDataURL();
        canvas.width = parent.offsetWidth;
        canvas.height = parent.offsetHeight;
        
        const ctx = canvas.getContext('2d');
        ctx.lineCap = 'round';
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        contextRef.current = ctx;

        // Restore drawing after resize
        const img = new Image();
        img.src = tempImage;
        img.onload = () => ctx.drawImage(img, 0, 0);
      }
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    if (e.touches && e.touches[0]) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top
      };
    }
    return {
      x: e.nativeEvent.offsetX,
      y: e.nativeEvent.offsetY
    };
  };

  const startDrawing = (e) => {
    const { x, y } = getPos(e);
    setStartPos({ x, y });
    setIsDrawing(true);
    
    setSnapshot(contextRef.current.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height));

    if (tool === 'pencil' || tool === 'eraser') {
      contextRef.current.beginPath();
      contextRef.current.moveTo(x, y);
    }
  };

  const draw = (e) => {
    if (!isDrawing) return;
    const { x, y } = getPos(e);
    const ctx = contextRef.current;

    if (tool === 'pencil' || tool === 'eraser') {
      ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
      ctx.strokeStyle = tool === 'eraser' ? 'rgba(0,0,0,1)' : color;
      ctx.lineWidth = tool === 'eraser' ? 20 : lineWidth;
      ctx.lineTo(x, y);
      ctx.stroke();
    } else {
      ctx.putImageData(snapshot, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      
      if (tool === 'line') {
        ctx.moveTo(startPos.x, startPos.y);
        ctx.lineTo(x, y);
      } else if (tool === 'rect') {
        ctx.strokeRect(startPos.x, startPos.y, x - startPos.x, y - startPos.y);
      } else if (tool === 'circle') {
        const radius = Math.sqrt(Math.pow(x - startPos.x, 2) + Math.pow(y - startPos.y, 2));
        ctx.arc(startPos.x, startPos.y, radius, 0, 2 * Math.PI);
      }
      ctx.stroke();
    }
  };

  const stopDrawing = () => {
    if (isDrawing) {
      contextRef.current.closePath();
      setIsDrawing(false);
    }
  };

  const clearCanvas = () => {
    const ctx = contextRef.current;
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
  };

  const ToolItem = ({ name, icon: Icon, activeTool }) => (
    <motion.div 
      whileHover={{ y: -5 }}
      whileTap={{ scale: 0.9 }}
      className={`apple-tool ${activeTool === name ? 'active' : ''}`}
      onClick={() => setTool(name)}
    >
      <div className="tool-icon-wrapper">
        <Icon size={22} strokeWidth={activeTool === name ? 2.5 : 2} />
      </div>
      {activeTool === name && <motion.div layoutId="indicator" className="active-indicator" />}
    </motion.div>
  );

  return (
    <div className="whiteboard-container">
      <canvas
        ref={canvasRef}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={(e) => {
          e.preventDefault(); // Prevent scrolling while drawing
          draw(e);
        }}
        onTouchEnd={stopDrawing}
        className="whiteboard-canvas"
      />

      {/* Apple Pencil Style Floating Toolbar */}
      <motion.div 
        initial={{ y: 100, x: '-50%' }}
        animate={{ y: 0, x: '-50%' }}
        className="apple-pencil-toolbar"
      >
        <ToolItem name="pencil" icon={Pencil} activeTool={tool} />
        <ToolItem name="line" icon={Minus} activeTool={tool} />
        <ToolItem name="rect" icon={Square} activeTool={tool} />
        <ToolItem name="circle" icon={Circle} activeTool={tool} />
        <ToolItem name="eraser" icon={Eraser} activeTool={tool} />
        
        <div className="apple-divider" />
        
        <div className="color-swatch-container">
          {['#000000', '#0071e3', '#ff3b30', '#34c759', '#ff9500'].map(c => (
            <div 
              key={c}
              className={`color-circle ${color === c ? 'selected' : ''}`}
              style={{ backgroundColor: c }}
              onClick={() => setColor(c)}
            />
          ))}
        </div>

        <div className="apple-divider" />
        
        <button className="apple-tool-action" onClick={clearCanvas}>
          <Trash2 size={20} />
        </button>
      </motion.div>
    </div>
  );
};

export default CanvasBoard;
