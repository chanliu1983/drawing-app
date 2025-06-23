import React, { useRef, useState, useEffect } from 'react';
import paper from 'paper';
import ReactJson from 'react-json-view';
import SplitPane from 'react-split-pane';
import initialData from './initialDataLoader';


const PaperCanvas = () => {
  const canvasRef = useRef(null);
  const resizeCanvasRef = useRef(null);
  const [boxes, setBoxes] = useState([]);
  const [connections, setConnections] = useState([]);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const [jsonData, setJsonData] = useState(initialData);

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

      const stockBox = new paper.Path.Rectangle({
        point: [x - boxWidth/2, y - boxHeight/2],
        size: [boxWidth, boxHeight],
        fillColor: 'lightblue',
        strokeColor: 'blue',
        strokeWidth: 2
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

      // Update existing stock name if it exists
      const existingBox = paperState.current.boxes.find(b => b.stockId === stockData.id);
      if (existingBox) {
        const textToUpdate = existingBox.children[1];
        if (textToUpdate && textToUpdate.content !== stockName) {
          textToUpdate.content = stockName;
        }
      }

      // Add drag functionality
      let isDragging = false;
      let offset = new paper.Point();

      stockGroup.onMouseDown = (event) => {
        isDragging = true;
        offset = stockGroup.position.subtract(event.point);
      };

      stockGroup.onMouseDrag = (event) => {
        if (isDragging) {
          stockGroup.position = event.point.add(offset);
          const boxIndex = newBoxes.findIndex(b => b === stockGroup);
          updateConnectionsOnDrag(stockGroup, boxIndex);
        }
      };

      stockGroup.onMouseUp = () => {
        isDragging = false;
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
  }, [jsonData]);

  const addBox = () => {
    console.log('Adding box');
    // Generate a unique stock ID
    const maxId = Math.max(0, ...jsonData.boxes.map(b => b.id || 0));
    const newStock = {
      id: maxId + 1,
      name: `Stock ${maxId + 1}`,
      type: 'stock',
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

  const removeBox = () => {
    console.log('Removing stock');
    setJsonData(prev => {
      if (prev.boxes.length === 0) return prev;
      const removedId = prev.boxes[prev.boxes.length - 1].id;
      return {
        ...prev,
        boxes: prev.boxes.slice(0, -1),
        connections: prev.connections.filter(conn => conn.fromStockId !== removedId && conn.toStockId !== removedId)
      };
    });
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
    // Only update positions, not names, to preserve manual edits from the editor
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
            }
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
        }
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
      `}</style>
      <SplitPane split="vertical" defaultSize="75%" resizerStyle={{backgroundColor: '#ccc', width: '5px'}} onPaneResized={() => resizeCanvasRef.current && resizeCanvasRef.current()}>
        <div style={{ position: 'relative', height: '100%' }}>
          <canvas
            ref={canvasRef}
            id="myCanvas"
            resize="true"
            style={{ display: 'block', width: '100%', height: '100%' }}
          />
          <button
            onClick={addBox}
            style={{ position: 'absolute', top: 10, left: 10, zIndex: 10 }}
          >
            Add Stock
          </button>
          <button
            onClick={removeBox}
            style={{ position: 'absolute', top: 10, left: 100, zIndex: 10 }}
          >
            Remove Stock
          </button>
        </div>
        <div style={{ height: '100%', borderLeft: '1px solid #ccc', overflowY: 'auto', display: 'flex', flexDirection: 'column', flex: 1 }}>
          <ReactJson
            src={jsonData}
            name={false}
            displayDataTypes={false}
            displayObjectSize={false}
            enableClipboard={true}
            style={{ flex: 1, height: '100%', fontSize: 14, textAlign: 'left', background: 'white', padding: 8, overflow: 'auto' }}
            theme="rjv-default"
            onEdit={e => {
              if (e.updated_src) setJsonData(e.updated_src);
            }}
            onAdd={e => {
              if (e.updated_src) setJsonData(e.updated_src);
            }}
            onDelete={e => {
              if (e.updated_src) setJsonData(e.updated_src);
            }}
          />
        </div>
      </SplitPane>
    </div>
  );
};

export default PaperCanvas;