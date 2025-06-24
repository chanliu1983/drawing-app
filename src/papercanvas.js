import React, { useRef, useState, useEffect } from 'react';
import paper from 'paper';
import SplitPane from 'react-split-pane';
import Editor from '@monaco-editor/react';
import initialData from './initialDataLoader';


const PaperCanvas = () => {
  const canvasRef = useRef(null);
  const resizeCanvasRef = useRef(null);
  const [boxes, setBoxes] = useState([]);
  const [connections, setConnections] = useState([]);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const [jsonData, setJsonData] = useState(initialData);
  const [editorValue, setEditorValue] = useState(JSON.stringify(initialData, null, 2));
  
  // Toolbox state
  const [toolboxCollapsed, setToolboxCollapsed] = useState(false);
  const [toolboxPosition, setToolboxPosition] = useState({ x: 10, y: 10 });
  const [showStockForm, setShowStockForm] = useState(false);
  const [newStockName, setNewStockName] = useState('');
  const [newStockAmount, setNewStockAmount] = useState(0);
  const [selectedStock, setSelectedStock] = useState(null); // Track selected stock
  const [editingStock, setEditingStock] = useState(null); // For editing form
  const [selectedBoxId, setSelectedBoxId] = useState(null); // Track selected box

  const paperState = useRef({
    boxes: [],
    connections: [],
    lastWidth: null,
    lastHeight: null,
  });
  paperState.current.boxes = boxes;
  paperState.current.connections = connections;

  // Draw axes function moved outside useEffect for reuse
  const drawAxes = () => {
    // Remove old axes if they exist to prevent duplicates on resize
    paper.project.getItems({ name: 'axis' }).forEach(item => item.remove());

    const origin = new paper.Point(50, paper.view.size.height - 50);
    const viewSize = paper.view.size;

    // X-axis
    const xAxis = new paper.Path.Line(new paper.Point(0, origin.y), new paper.Point(viewSize.width, origin.y));
    xAxis.strokeColor = 'grey';
    xAxis.name = 'axis';

    // Y-axis
    const yAxis = new paper.Path.Line(new paper.Point(origin.x, 0), new paper.Point(origin.x, viewSize.height));
    yAxis.strokeColor = 'grey';
    yAxis.name = 'axis';

    // Origin text
    const originText = new paper.PointText(origin.add(5, -10));
    originText.content = `(0,0)`;
    originText.fillColor = 'black';
    originText.fontSize = 12;
    originText.name = 'axis';

    // X-axis label
    const xLabel = new paper.PointText(new paper.Point(viewSize.width - 20, origin.y - 10));
    xLabel.content = 'x';
    xLabel.fillColor = 'grey';
    xLabel.name = 'axis';

    // Y-axis label
    const yLabel = new paper.PointText(new paper.Point(origin.x + 10, 20));
    yLabel.content = 'y';
    yLabel.fillColor = 'grey';
    yLabel.name = 'axis';
  };

  useEffect(() => {
    if (!canvasRef.current) {
      console.error('Canvas ref is null');
      return;
    }

    paper.setup(canvasRef.current);

    const updateConnectionsForResize = () => {
      if (!jsonData || !jsonData.connections) return;
      
      paperState.current.connections.forEach((connection, index) => {
        const connData = jsonData.connections[index];
        if (!connData) return;
        
        const fromStock = paperState.current.boxes.find(box => box.stockId === connData.fromStockId);
        const toStock = paperState.current.boxes.find(box => box.stockId === connData.toStockId);
        
        if (!fromStock || !toStock) return;
        
        const start = getEdgePoint(fromStock, toStock);
        const end = getEdgePoint(toStock, fromStock);
        const handle1 = new paper.Point((start.x + end.x) / 2, start.y);
        const handle2 = new paper.Point((start.x + end.x) / 2, end.y);

        // Access the path (first child) from the connection group
        const path = connection.children[0];
        if (path && path.segments && path.segments.length === 2) {
          path.segments[0].point = start;
          path.segments[1].point = end;
          path.segments[0].handleOut = handle1.subtract(start);
          path.segments[1].handleIn = handle2.subtract(end);
        }
        
        // Update arrow head (second child) - fixed triangle
        const arrowHead = connection.children[1];
        if (arrowHead && arrowHead.segments) {
          const arrowSize = 8;
          arrowHead.segments[0].point = new paper.Point(end.x - arrowSize, end.y - arrowSize/2);
          arrowHead.segments[1].point = new paper.Point(end.x, end.y);
          arrowHead.segments[2].point = new paper.Point(end.x - arrowSize, end.y + arrowSize/2);
        }
      });
    };

    const resizeCanvas = () => {
      if (!canvasRef.current || !canvasRef.current.parentElement) return;

      const canvasContainer = canvasRef.current.parentElement;
      const newWidth = canvasContainer.clientWidth;
      const newHeight = canvasContainer.clientHeight;

      const oldHeight = paperState.current.lastHeight;

      // Handle height changes - move boxes to maintain relative position from bottom
      if (oldHeight !== null) {
        const deltaY = newHeight - oldHeight;
        if (deltaY !== 0) {
          paperState.current.boxes.forEach(box => {
            box.position.y += deltaY;
          });
        }
      }

      // Store new dimensions
      paperState.current.lastWidth = newWidth;
      paperState.current.lastHeight = newHeight;

      // Update canvas dimensions
      canvasRef.current.width = newWidth;
      canvasRef.current.height = newHeight;
      
      // Update Paper.js view size without scaling content
      paper.view.setViewSize(new paper.Size(newWidth, newHeight));
      
      // Ensure pixel ratio is maintained
      const pixelRatio = window.devicePixelRatio || 1;
      canvasRef.current.style.width = newWidth + 'px';
      canvasRef.current.style.height = newHeight + 'px';
      canvasRef.current.width = newWidth * pixelRatio;
      canvasRef.current.height = newHeight * pixelRatio;
      paper.view.setViewSize(new paper.Size(newWidth, newHeight));
      
      const ctx = canvasRef.current.getContext('2d');
      ctx.scale(pixelRatio, pixelRatio);
      
      updateConnectionsForResize();
      drawAxes();
      paper.view.draw();
    };
    resizeCanvasRef.current = resizeCanvas;

    // --- Add ResizeObserver to keep canvas in sync with pane size ---
    let observer = null;
    if (canvasRef.current && canvasRef.current.parentElement) {
      observer = new window.ResizeObserver(() => {
        resizeCanvas();
      });
      observer.observe(canvasRef.current.parentElement);
    }

    if (paperState.current.lastWidth === null) {
      paperState.current.lastWidth = window.innerWidth * 0.75; // Initial 75% width
    }
    if (paperState.current.lastHeight === null) {
      paperState.current.lastHeight = window.innerHeight;
    }

    resizeCanvas();
    setTimeout(() => {
      drawAxes();
      paper.view.draw();
    }, 0);
    window.addEventListener('resize', resizeCanvas);

    return () => {
      paper.project.clear();
      window.removeEventListener('resize', resizeCanvas);
      if (observer && canvasRef.current && canvasRef.current.parentElement) {
        observer.unobserve(canvasRef.current.parentElement);
      }
    };
  }, []);

  // Handle JSON data changes to render stocks and feedback loops
  useEffect(() => {
    if (!jsonData || !jsonData.boxes) return;

    // Clear existing items except axes
    paper.project.getItems().forEach(item => {
      if (item.name !== 'axis') {
        item.remove();
      }
    });

    const newBoxes = [];
    const newConnections = [];

    // Create stocks from JSON data
    jsonData.boxes.forEach((stockData, index) => {
      const boxWidth = 80;
      const boxHeight = 40;
      const x = stockData.position?.x || Math.random() * (paper.view.size.width - boxWidth);
      const y = stockData.position?.y || Math.random() * (paper.view.size.height - boxHeight);

      const isSelected = selectedBoxId === stockData.id;
      const stockBox = new paper.Path.Rectangle({
        point: [x - boxWidth/2, y - boxHeight/2],
        size: [boxWidth, boxHeight],
        fillColor: isSelected ? '#ffe082' : 'lightblue', // Highlight if selected
        strokeColor: isSelected ? '#ff9800' : 'blue',
        strokeWidth: isSelected ? 3 : 2
      });

      const stockName = stockData.name || `Stock ${index + 1}`;
      const textLabel = new paper.PointText({
        point: [x, y],
        content: stockName,
        fillColor: 'black',
        fontSize: 10,
        justification: 'center'
      });

      const stockGroup = new paper.Group([stockBox, textLabel]);
      stockGroup.stockName = stockName;
      stockGroup.stockId = stockData.id;
      stockGroup.position = new paper.Point(x, y);

      // Add selection logic
      stockGroup.onClick = (event) => {
        setSelectedStock(stockData);
        setEditingStock({ ...stockData });
        event.stopPropagation();
      };

      // Add drag functionality
      let isDragging = false;
      let offset = new paper.Point();

      stockGroup.onMouseDown = (event) => {
        isDragging = true;
        offset = stockGroup.position.subtract(event.point);
        // Ensure selection is set on drag start
        setSelectedStock(stockData);
        setEditingStock({ ...stockData });
      };

      stockGroup.onMouseDrag = (event) => {
        if (isDragging) {
          stockGroup.position = event.point.add(offset);
          const boxIndex = newBoxes.findIndex(b => b === stockGroup);
          updateConnectionsOnDrag(stockGroup, boxIndex);
        }
      };

      stockGroup.onMouseUp = () => {
        // Only set isDragging to false, don't clear selection
        isDragging = false;
        // Keep selection after drag
        setSelectedStock(stockData);
        setEditingStock({ ...stockData });
      };

      newBoxes.push(stockGroup);
    });

    // Create feedback loops from JSON data
    if (jsonData.connections) {
      jsonData.connections.forEach((connData) => {
        const fromStock = newBoxes.find(box => box.stockId === connData.fromStockId);
        const toStock = newBoxes.find(box => box.stockId === connData.toStockId);
        if (fromStock && toStock) {
          const connection = createConnection(fromStock, toStock, connData);
          newConnections.push(connection);
        }
      });
    }

    // Update state
    setBoxes(newBoxes);
    setConnections(newConnections);
    paperState.current.boxes = newBoxes;
    paperState.current.connections = newConnections;

    // Redraw axes and view
    drawAxes();
    paper.view.draw();
  }, [jsonData, selectedBoxId]);

  // Keep editor value in sync with jsonData
  useEffect(() => {
    setEditorValue(JSON.stringify(jsonData, null, 2));
  }, [jsonData]);

  const addBox = () => {
    console.log('Adding box');
    // Generate a unique stock ID
    const maxId = Math.max(0, ...jsonData.boxes.map(b => b.id || 0));
    const newStock = {
      id: maxId + 1,
      name: `Stock ${maxId + 1}`,
      type: 'stock',
      amount: 0,
      position: {
        x: Math.round(Math.random() * (paper.view.size.width - 50)),
        y: Math.round(Math.random() * (paper.view.size.height - 50))
      }
    };
    setJsonData(prev => ({
      ...prev,
      boxes: [...prev.boxes, newStock]
    }));
  };
  
  const [pendingStockPlacement, setPendingStockPlacement] = useState(false);
  const [pendingStockData, setPendingStockData] = useState(null);

  const addBoxWithNameAndAmount = (name, amount) => {
    console.log(`Preparing to add box with name: ${name}, amount: ${amount}`);
    // Set pending stock data and enable placement mode
    setPendingStockData({ name, amount });
    setPendingStockPlacement(true);
    // No alert - we'll use a custom cursor instead
  };
  
  const placeStockAtPosition = (x, y) => {
    if (!pendingStockData) return;
    
    console.log(`Adding box at position: (${x}, ${y})`);
    // Generate a unique stock ID
    const maxId = Math.max(0, ...jsonData.boxes.map(b => b.id || 0));
    const newStock = {
      id: maxId + 1,
      name: pendingStockData.name,
      type: 'stock',
      amount: pendingStockData.amount,
      position: {
        x: x,
        y: y
      }
    };
    setJsonData(prev => ({
      ...prev,
      boxes: [...prev.boxes, newStock]
    }));
    
    // Reset pending state
    setPendingStockData(null);
    setPendingStockPlacement(false);
  };
  

  // Helper function to calculate edge intersection point
  const getEdgePoint = (fromBox, toBox) => {
    const fromCenter = fromBox.bounds.center;
    const toCenter = toBox.bounds.center;
    const direction = toCenter.subtract(fromCenter).normalize();
    
    // Calculate intersection with the edge of the target box
    const toBounds = toBox.bounds;
    const halfWidth = toBounds.width / 2;
    const halfHeight = toBounds.height / 2;
    
    // Determine which edge the line intersects
    const absX = Math.abs(direction.x);
    const absY = Math.abs(direction.y);
    
    let edgePoint;
    if (absX / halfWidth > absY / halfHeight) {
      // Intersects left or right edge
      const x = toCenter.x + (direction.x > 0 ? -halfWidth : halfWidth);
      const y = toCenter.y - (direction.y * halfWidth / absX);
      edgePoint = new paper.Point(x, y);
    } else {
      // Intersects top or bottom edge
      const x = toCenter.x - (direction.x * halfHeight / absY);
      const y = toCenter.y + (direction.y > 0 ? -halfHeight : halfHeight);
      edgePoint = new paper.Point(x, y);
    }
    
    return edgePoint;
  };

  const createConnection = (box1, box2, connectionData = null) => {
    console.log('Creating connection');
    const start = getEdgePoint(box1, box2); // from box1 (from) to box2 (to)
    const end = getEdgePoint(box2, box1);   // to box2 (to) from box1 (from)
    const arrowSize = 8;
    const direction = end.subtract(start).normalize();
    const perpendicular = new paper.Point(-direction.y, direction.x);
    // Calculate the base of the arrowhead
    const arrowBase = end.subtract(direction.multiply(arrowSize));
    const arrowLeft = arrowBase.add(perpendicular.multiply(arrowSize/2));
    const arrowRight = arrowBase.subtract(perpendicular.multiply(arrowSize/2));
    // The curve should end at the base of the arrow, not the box
    const handle1 = new paper.Point((start.x + arrowBase.x) / 2, start.y);
    const handle2 = new paper.Point((start.x + arrowBase.x) / 2, arrowBase.y);
    const path = new paper.Path({
        segments: [new paper.Segment(start), new paper.Segment(arrowBase)],
        strokeColor: 'black',
        strokeWidth: 2
    });
    path.segments[0].handleOut = handle1.subtract(start);
    path.segments[1].handleIn = handle2.subtract(arrowBase);
    // Arrow always on 'to' side (end) - directional based on connection
    const arrowTip = end;
    const arrowHead = new paper.Path({
        segments: [arrowTip, arrowLeft, arrowRight],
        strokeColor: 'black',
        strokeWidth: 2,
        fillColor: 'black',
        closed: true
    });
    // Add feedback loop name label if connection data is provided
    let nameLabel = null;
    if (connectionData && connectionData.name) {
      const midPoint = start.add(arrowBase).divide(2);
      nameLabel = new paper.PointText({
        point: midPoint.add(new paper.Point(0, -10)),
        content: connectionData.name,
        fillColor: 'black',
        fontSize: 12,
        justification: 'center'
      });
    }
    const connectionGroup = nameLabel ? 
      new paper.Group([path, arrowHead, nameLabel]) : 
      new paper.Group([path, arrowHead]);
    if (connectionData) {
      connectionGroup.connectionData = connectionData;
    }
    return connectionGroup;
  };

  const updateConnectionsAfterBoxChange = (newBoxes) => {
    console.log('Updating connections after box change');
    paperState.current.connections.forEach(conn => conn.remove());
    const newConnections = [];
    const connectionsData = [];
    
    for (let i = 0; i < newBoxes.length - 1; i++) {
      const connection = createConnection(newBoxes[i], newBoxes[i + 1]);
      newConnections.push(connection);
      
      // Add connection data for JSON
      const fromStockName = newBoxes[i].stockName || `Stock ${i + 1}`;
      const toStockName = newBoxes[i + 1].stockName || `Stock ${i + 2}`;
      const fromStockId = newBoxes[i].stockId || (i + 1);
      const toStockId = newBoxes[i + 1].stockId || (i + 2);
      connectionsData.push({
        id: i + 1,
        name: `${fromStockName} → ${toStockName}`,
        type: 'feedback_loop',
        fromStockId: fromStockId,
        toStockId: toStockId
      });
    }
    
    setConnections(newConnections);
    paperState.current.connections = newConnections;
    // Only update positions, not names or amounts, to preserve manual edits from the editor
    setJsonData(prev => ({
      ...prev,
      boxes: prev.boxes.map(box => {
        const updatedBox = newBoxes.find(b => b.stockId === box.id);
        if (updatedBox) {
          return {
            ...box,
            position: {
              x: Math.round(updatedBox.position.x),
              y: Math.round(updatedBox.position.y)
            },
            amount: box.amount !== undefined ? box.amount : 0
          };
        }
        return box;
      }),
      connections: prev.connections // preserve names and structure
    }));
    console.log('New connections:', newConnections.length);
  };

  const updateConnectionsOnDrag = (draggedBox, boxIndex) => {
    // Update JSON data for the dragged box
    setJsonData(prev => {
      const newBoxes = [...prev.boxes];
      newBoxes[boxIndex] = {
        ...newBoxes[boxIndex],
        position: {
          x: Math.round(draggedBox.position.x),
          y: Math.round(draggedBox.position.y)
        },
        amount: newBoxes[boxIndex].amount || 0
      };
      return { ...prev, boxes: newBoxes };
    });

    // Update all connections based on stockId, not array index
    if (!jsonData || !jsonData.connections) return;
    jsonData.connections.forEach((connData, i) => {
      const connection = paperState.current.connections[i];
      if (!connection) return;
      // Find the from and to boxes by stockId
      const fromBox = paperState.current.boxes.find(b => b.stockId === connData.fromStockId);
      const toBox = paperState.current.boxes.find(b => b.stockId === connData.toStockId);
      if (!fromBox || !toBox) return;
      const start = getEdgePoint(fromBox, toBox);
      const end = getEdgePoint(toBox, fromBox);
      const arrowSize = 8;
      const direction = end.subtract(start).normalize();
      const perpendicular = new paper.Point(-direction.y, direction.x);
      const arrowBase = end.subtract(direction.multiply(arrowSize));
      const arrowLeft = arrowBase.add(perpendicular.multiply(arrowSize/2));
      const arrowRight = arrowBase.subtract(perpendicular.multiply(arrowSize/2));
      // The curve should end at the base of the arrow, not the box
      const handle1 = new paper.Point((start.x + arrowBase.x) / 2, start.y);
      const handle2 = new paper.Point((start.x + arrowBase.x) / 2, arrowBase.y);
      const path = connection.children[0];
      if (path && path.segments) {
        path.segments[0].point = start;
        path.segments[1].point = arrowBase;
        path.segments[0].handleOut = handle1.subtract(start);
        path.segments[1].handleIn = handle2.subtract(arrowBase);
      }
      // Arrow always on 'to' side
      const arrowHead = connection.children[1];
      if (arrowHead && arrowHead.segments) {
        arrowHead.segments[0].point = end;
        arrowHead.segments[1].point = arrowLeft;
        arrowHead.segments[2].point = arrowRight;
      }
      // Update connection name label if it exists
      const nameLabel = connection.children[2];
      if (nameLabel && nameLabel.content) {
        const midPoint = start.add(arrowBase).divide(2);
        nameLabel.point = midPoint.add(new paper.Point(0, -10));
      }
    });
    paper.view.draw();
  };

  return (
    <div style={{ width: '100vw', height: '100vh', margin: 0, padding: 0, overflow: 'hidden', position: 'fixed', top: 0, left: 0 }}>
      {/* Robust style for SplitPane resizer cursor and pointer events */}
      <style>{`
        .SplitPane .Resizer,
        .Resizer,
        .SplitPane-resizer {
          cursor: col-resize !important;
          pointer-events: auto !important;
        }
        .SplitPane .Resizer:hover,
        .Resizer:hover,
        .SplitPane-resizer:hover,
        .SplitPane .Resizer:active,
        .Resizer:active,
        .SplitPane-resizer:active {
          cursor: col-resize !important;
        }
        /* Fix for sometimes losing pointer events after drag */
        .SplitPane .Resizer[style*="pointer-events: none"],
        .Resizer[style*="pointer-events: none"],
        .SplitPane-resizer[style*="pointer-events: none"] {
          pointer-events: auto !important;
        }
        
        /* Custom cursor for stock placement */
        .stock-placement-cursor {
          cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Crect x='4' y='4' width='24' height='24' rx='2' ry='2' fill='%234CAF50' fill-opacity='0.7' stroke='%23333' stroke-width='2'/%3E%3Ctext x='16' y='20' font-family='Arial' font-size='12' text-anchor='middle' fill='white'%3ES%3C/text%3E%3C/svg%3E") 16 16, crosshair;
        }
      `}</style>
      <SplitPane split="vertical" defaultSize="75%" resizerStyle={{backgroundColor: '#ccc', width: '5px'}} onPaneResized={() => resizeCanvasRef.current && resizeCanvasRef.current()}>
        <div style={{ position: 'relative', height: '100%' }}>
          <canvas
            ref={canvasRef}
            id="myCanvas"
            resize="true"
            className={pendingStockPlacement ? 'stock-placement-cursor' : ''}
            style={{ 
              display: 'block', 
              width: '100%', 
              height: '100%'
            }}
            onClick={(e) => {
              if (pendingStockPlacement && pendingStockData) {
                // Get canvas-relative coordinates
                const rect = e.target.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                placeStockAtPosition(x, y);
              } else {
                // Check if the click was directly on the canvas (not on a stock)
                // This is determined by checking if the event target is the canvas itself
                if (e.target === canvasRef.current) {
                  // Clear selection when clicking on empty canvas area
                  setSelectedStock(null);
                  setEditingStock(null);
                }
              }
            }}
          />
          <div 
            style={{
              position: 'absolute',
              top: toolboxPosition.y,
              left: toolboxPosition.x,
              zIndex: 10,
              backgroundColor: '#f0f0f0',
              border: '1px solid #ccc',
              borderRadius: '5px',
              boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
              width: toolboxCollapsed ? '40px' : '200px',
              transition: 'width 0.3s ease',
              overflow: 'hidden'
            }}
          >
            {/* Toolbox header with drag handle and collapse button */}
            <div 
              style={{
                padding: '8px',
                backgroundColor: pendingStockPlacement ? '#e0ffe0' : '#e0e0e0',
                cursor: 'move',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                transition: 'background-color 0.3s ease'
              }}
              onMouseDown={(e) => {
                const startX = e.clientX;
                const startY = e.clientY;
                const startLeft = toolboxPosition.x;
                const startTop = toolboxPosition.y;
                
                const onMouseMove = (moveEvent) => {
                  const dx = moveEvent.clientX - startX;
                  const dy = moveEvent.clientY - startY;
                  setToolboxPosition({
                    x: startLeft + dx,
                    y: startTop + dy
                  });
                };
                
                const onMouseUp = () => {
                  document.removeEventListener('mousemove', onMouseMove);
                  document.removeEventListener('mouseup', onMouseUp);
                };
                
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
              }}
            >
              <span>
                {toolboxCollapsed ? '🧰' : (
                  pendingStockPlacement 
                    ? <span style={{ color: '#4CAF50', fontWeight: 'bold' }}>Click to place: {pendingStockData?.name}</span>
                    : selectedStock
                      ? <span style={{ color: '#ff6600', fontWeight: 'bold' }}>Selected: {selectedStock.name}</span>
                      : 'Stock Toolbox'
                )}
              </span>
              <div style={{ display: 'flex', gap: '5px' }}>
                {pendingStockPlacement && !toolboxCollapsed && (
                  <button 
                    onClick={() => {
                      setPendingStockPlacement(false);
                      setPendingStockData(null);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '16px',
                      color: '#f44336'
                    }}
                    title="Cancel placement"
                  >
                    ✖
                  </button>
                )}
                <button 
                  onClick={() => setToolboxCollapsed(!toolboxCollapsed)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '16px'
                  }}
                >
                  {toolboxCollapsed ? '➕' : '➖'}
                </button>
              </div>
            </div>
            
            {/* Toolbox content */}
            {!toolboxCollapsed && (
              <div style={{ padding: '10px' }}>
                {selectedStock ? (
                  // Edit selected stock form
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ marginBottom: '8px', fontWeight: 'bold', color: '#ff6600' }}>
                      Edit Selected Stock
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '4px' }}>Stock Name:</label>
                      <input 
                        type="text" 
                        value={editingStock ? editingStock.name : ''}
                        onChange={(e) => setEditingStock({ ...editingStock, name: e.target.value })}
                        style={{ width: '100%', padding: '6px', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '4px' }}>Amount:</label>
                      <input 
                        type="number" 
                        value={editingStock ? editingStock.amount : ''}
                        onChange={(e) => setEditingStock({ ...editingStock, amount: Number(e.target.value) })}
                        style={{ width: '100%', padding: '6px', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                      <button 
                        onClick={() => {
                          // Update the selected stock
                          setJsonData(prev => ({
                            ...prev,
                            boxes: prev.boxes.map(box => 
                              box.id === editingStock.id ? editingStock : box
                            )
                          }));
                          
                          // Update selected stock state
                          setSelectedStock(editingStock);
                          
                          // Keep the form values as they are (don't reset)
                          // This allows continued editing of the same stock
                        }}
                        style={{
                          flex: 1,
                          padding: '6px 12px',
                          backgroundColor: '#ff6600',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer'
                        }}
                      >
                        Update
                      </button>
                      <button 
                        onClick={() => {
                          // Deselect the stock only when Cancel is pressed
                          setSelectedStock(null);
                          setEditingStock(null);
                        }}
                        style={{
                          flex: 1,
                          padding: '6px 12px',
                          backgroundColor: '#9e9e9e',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer'
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                    <button 
                      onClick={() => {
                        // Remove the selected stock
                        setJsonData(prev => ({
                          ...prev,
                          boxes: prev.boxes.filter(box => box.id !== selectedStock.id),
                          connections: prev.connections.filter(
                            conn => conn.fromStockId !== selectedStock.id && conn.toStockId !== selectedStock.id
                          )
                        }));
                        
                        // Deselect the stock
                        setSelectedStock(null);
                        setEditingStock(null);
                      }}
                      style={{
                        marginTop: '8px',
                        padding: '6px 12px',
                        backgroundColor: '#f44336',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}
                    >
                      Delete Stock
                    </button>
                  </div>
                ) : !showStockForm ? (
                  // Regular toolbox buttons when no stock is selected
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <button 
                      onClick={() => setShowStockForm(true)}
                      disabled={pendingStockPlacement}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: pendingStockPlacement ? '#cccccc' : '#4CAF50',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: pendingStockPlacement ? 'not-allowed' : 'pointer',
                        opacity: pendingStockPlacement ? 0.7 : 1
                      }}
                    >
                      Add Stock
                    </button>
                    
                  </div>
                ) : (
                  // Add new stock form
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '4px' }}>Stock Name:</label>
                      <input 
                        type="text" 
                        value={newStockName}
                        onChange={(e) => setNewStockName(e.target.value)}
                        style={{ width: '100%', padding: '6px', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '4px' }}>Initial Amount:</label>
                      <input 
                        type="number" 
                        value={newStockAmount}
                        onChange={(e) => setNewStockAmount(Number(e.target.value))}
                        style={{ width: '100%', padding: '6px', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                      <button 
                        onClick={() => {
                          if (newStockName.trim()) {
                            // Call modified addBox with name and amount
                            addBoxWithNameAndAmount(newStockName, newStockAmount);
                            // Reset form
                            setNewStockName('');
                            setNewStockAmount(0);
                            setShowStockForm(false);
                          }
                        }}
                        style={{
                          flex: 1,
                          padding: '6px 12px',
                          backgroundColor: '#4CAF50',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer'
                        }}
                      >
                        Add
                      </button>
                      <button 
                        onClick={() => {
                          setNewStockName('');
                          setNewStockAmount(0);
                          setShowStockForm(false);
                        }}
                        style={{
                          flex: 1,
                          padding: '6px 12px',
                          backgroundColor: '#9e9e9e',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer'
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <div style={{ height: '100%', borderLeft: '1px solid #ccc', display: 'flex', flexDirection: 'column', flex: 1 }}>
          <Editor
            height="100%"
            language="json"
            value={editorValue}
            onChange={(value) => {
              setEditorValue(value);
              try {
                const parsedValue = JSON.parse(value);
                setJsonData(parsedValue);
              } catch (error) {
                // Don't update if JSON is invalid
                console.error('Invalid JSON:', error);
              }
            }}
            options={{
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              fontSize: 14,
              automaticLayout: true,
              formatOnPaste: true,
              formatOnType: true
            }}
          />
        </div>
      </SplitPane>
    </div>
  );
};

export default PaperCanvas;