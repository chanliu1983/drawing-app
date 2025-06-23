import React, { useEffect, useRef, useState } from 'react';
import paper from 'paper';
import JSONInput from 'react-json-editor-ajrm';
import locale from 'react-json-editor-ajrm/locale/en';
import SplitPane from 'react-split-pane';

const PaperCanvas = () => {
  const canvasRef = useRef(null);
  const resizeCanvasRef = useRef(null);
  const [boxes, setBoxes] = useState([]);
  const [connections, setConnections] = useState([]);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const [jsonData, setJsonData] = useState({
    boxes: [
      { 
        id: 1,
        name: "Population", 
        type: "stock",
        position: { x: 150, y: 150 } 
      },
      { 
        id: 2,
        name: "Birth Rate", 
        type: "stock",
        position: { x: 350, y: 150 } 
      },
      { 
        id: 3,
        name: "Resources", 
        type: "stock",
        position: { x: 250, y: 300 } 
      }
    ],
    connections: [
      { 
        id: 1,
        name: "Population Growth",
        type: "feedback_loop",
        fromStockId: 1, 
        toStockId: 2
      },
      { 
        id: 2,
        name: "Resource Consumption",
        type: "feedback_loop",
        fromStockId: 1, 
        toStockId: 3
      }
    ]
  });

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
      paperState.current.connections.forEach((connection, index) => {
        if (index + 1 >= paperState.current.boxes.length) {
          return;
        }
        const box1 = paperState.current.boxes[index];
        const box2 = paperState.current.boxes[index + 1];
        const start = getEdgePoint(box2, box1);
        const end = getEdgePoint(box1, box2);
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

    if (paperState.current.lastWidth === null) {
      paperState.current.lastWidth = window.innerWidth * 0.75; // Initial 75% width
    }
    if (paperState.current.lastHeight === null) {
      paperState.current.lastHeight = window.innerHeight;
    }

    resizeCanvas();
    
    // Use setTimeout to ensure canvas is fully initialized before drawing axes
    setTimeout(() => {
      drawAxes();
      paper.view.draw();
    }, 0);
    
    window.addEventListener('resize', resizeCanvas);

    return () => {
      paper.project.clear();
      window.removeEventListener('resize', resizeCanvas);
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
    const boxWidth = 50;
    const boxHeight = 50;
    const viewWidth = paper.view.size.width;
    const viewHeight = paper.view.size.height;
    const x = Math.random() * (viewWidth - boxWidth);
    const y = Math.random() * (viewHeight - boxHeight);
    setCoords({ x: Math.round(x), y: Math.round(y) });

    const newBox = new paper.Path.Rectangle({
      point: [x, y],
      size: [boxWidth, boxHeight],
      fillColor: 'lightblue',
      strokeColor: 'blue',
      strokeWidth: 2
    });

    // Add text label for the stock name
    const stockName = `Stock ${paperState.current.boxes.length + 1}`;
    const textLabel = new paper.PointText({
      point: [x + boxWidth/2, y + boxHeight/2],
      content: stockName,
      fillColor: 'black',
      fontSize: 12,
      justification: 'center'
    });

    // Group the box and text together
    const stockGroup = new paper.Group([newBox, textLabel]);
    stockGroup.stockName = stockName;
    // Generate a unique stock ID
    const maxId = Math.max(0, ...paperState.current.boxes.map(b => b.stockId || 0));
    stockGroup.stockId = maxId + 1;

    let isDragging = false;
    let offset = new paper.Point();

    stockGroup.onMouseDown = (event) => {
      console.log('Stock mouse down');
      isDragging = true;
      offset = stockGroup.position.subtract(event.point);
    };

    stockGroup.onMouseDrag = (event) => {
      if (isDragging) {
        console.log('Stock dragging');
        stockGroup.position = event.point.add(offset);
        const boxIndex = paperState.current.boxes.findIndex(b => b === stockGroup);
        updateConnectionsOnDrag(stockGroup, boxIndex);
      }
    };

    stockGroup.onMouseUp = () => {
      console.log('Stock mouse up');
      isDragging = false;
    };

    setBoxes(prevBoxes => {
      const newBoxes = [...prevBoxes, stockGroup];
      console.log('New stocks:', newBoxes.length);
      updateConnectionsAfterBoxChange(newBoxes);
      
      // Update JSON data
      const boxesData = newBoxes.map((stock, index) => ({
        id: stock.stockId || (index + 1),
        name: stock.stockName || `Stock ${index + 1}`,
        type: 'stock',
        position: {
          x: Math.round(stock.position.x),
          y: Math.round(stock.position.y)
        }
      }));
      setJsonData(prev => ({ ...prev, boxes: boxesData }));
      
      return newBoxes;
    });

    paper.view.draw();
  };

  const removeBox = () => {
    console.log('Removing stock');
    if (paperState.current.boxes.length > 0) {
      const lastStock = paperState.current.boxes.pop();
      lastStock.remove();
      const newBoxes = [...paperState.current.boxes];
      setBoxes(newBoxes);
      updateConnectionsAfterBoxChange(newBoxes);
      paper.view.draw();
    }
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
    const handle1 = new paper.Point((start.x + end.x) / 2, start.y);
    const handle2 = new paper.Point((start.x + end.x) / 2, end.y);

    const path = new paper.Path({
        segments: [new paper.Segment(start), new paper.Segment(end)],
        strokeColor: 'black',
        strokeWidth: 2
    });

    path.segments[0].handleOut = handle1.subtract(start);
    path.segments[1].handleIn = handle2.subtract(end);

    // Arrow always on 'to' side (end) - directional based on connection
    const arrowSize = 8;
    const direction = end.subtract(start).normalize();
    const perpendicular = new paper.Point(-direction.y, direction.x);
    
    const arrowTip = end;
    const arrowBase = end.subtract(direction.multiply(arrowSize));
    const arrowLeft = arrowBase.add(perpendicular.multiply(arrowSize/2));
    const arrowRight = arrowBase.subtract(perpendicular.multiply(arrowSize/2));
    
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
      const midPoint = start.add(end).divide(2);
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
    
    // Store connection data for updates
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
    setJsonData(prev => ({ ...prev, connections: connectionsData }));
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
      const handle1 = new paper.Point((start.x + end.x) / 2, start.y);
      const handle2 = new paper.Point((start.x + end.x) / 2, end.y);
      const path = connection.children[0];
      if (path && path.segments) {
        path.segments[0].point = start;
        path.segments[1].point = end;
        path.segments[0].handleOut = handle1.subtract(start);
        path.segments[1].handleIn = handle2.subtract(end);
      }
      // Arrow always on 'to' side
      const arrowHead = connection.children[1];
      if (arrowHead && arrowHead.segments) {
        const arrowSize = 8;
        const direction = end.subtract(start).normalize();
        const perpendicular = new paper.Point(-direction.y, direction.x);
        const arrowTip = end;
        const arrowBase = end.subtract(direction.multiply(arrowSize));
        const arrowLeft = arrowBase.add(perpendicular.multiply(arrowSize/2));
        const arrowRight = arrowBase.subtract(perpendicular.multiply(arrowSize/2));
        arrowHead.segments[0].point = arrowTip;
        arrowHead.segments[1].point = arrowLeft;
        arrowHead.segments[2].point = arrowRight;
      }
      
      // Update connection name label if it exists
      const nameLabel = connection.children[2];
      if (nameLabel && nameLabel.content) {
        const midPoint = start.add(end).divide(2);
        nameLabel.point = midPoint.add(new paper.Point(0, -10));
      }
    });
    paper.view.draw();
  };

  return (
    <div style={{ width: '100vw', height: '100vh', margin: 0, padding: 0, overflow: 'hidden', position: 'fixed', top: 0, left: 0 }}>
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
          <JSONInput
            id='json-editor'
            placeholder={jsonData}
            locale={locale}
            height='100vh'
            width='100%'
            onChange={(data) => {
              if (!data.error && data.jsObject) {
                setJsonData(data.jsObject);
              }
            }}
            style={{ flex: 1, contentBox: { textAlign: 'left' } }}
            theme='light_mitsuketa_tribute'
          />
        </div>
      </SplitPane>
    </div>
  );
};

export default PaperCanvas;