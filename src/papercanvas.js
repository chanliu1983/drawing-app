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
  // Removed selectedMode - using only currentMode for simplicity
  const [newStockName, setNewStockName] = useState('');
  const [newStockAmount, setNewStockAmount] = useState(0);
  const [selectedStock, setSelectedStock] = useState(null); // Track selected stock
  const [editingStock, setEditingStock] = useState(null); // For editing form
  const [selectedBoxId, setSelectedBoxId] = useState(null); // Track selected box
  const [jsonEditorVisible, setJsonEditorVisible] = useState(true); // Control JSON editor visibility

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

  // Connection tool functions
  const handleConnectionClick = (stockId) => {
    console.log('handleConnectionClick called with stockId:', stockId);
    console.log('Current connectionStart:', connectionStart);
    if (!connectionStart) {
      // Start a new connection
      console.log('Starting new connection with stockId:', stockId);
      setConnectionStart(stockId);
    } else {
      // Complete the connection
      console.log('Attempting to complete connection from', connectionStart, 'to', stockId);
      if (connectionStart !== stockId) {
        console.log('Creating new connection');
        createNewConnection(connectionStart, stockId);
        // Switch back to normal mode after creating connection
        setCurrentMode('normal');
      } else {
        console.log('Same stock clicked, not creating connection');
      }
      // Reset connection state
      console.log('Resetting connection state');
      setConnectionStart(null);
      if (tempConnectionLine) {
        tempConnectionLine.remove();
        setTempConnectionLine(null);
      }
    }
  };

  const createNewConnection = (fromStockId, toStockId) => {
    const maxId = Math.max(0, ...jsonData.connections.map(c => c.id || 0));
    const fromStockData = jsonData.boxes.find(box => box.id === fromStockId);
    const toStockData = jsonData.boxes.find(box => box.id === toStockId);
    const connectionName = fromStockData && toStockData ? `${fromStockData.name} to ${toStockData.name}` : `Connection ${maxId + 1}`;
    const newConnection = {
      id: maxId + 1,
      name: connectionName,
      type: "feedback_loop",
      fromStockId: fromStockId,
      toStockId: toStockId
    };
    // Find the stock groups for visual connection
    const fromStockGroup = paperState.current.boxes.find(box => box.stockId === fromStockId);
    const toStockGroup = paperState.current.boxes.find(box => box.stockId === toStockId);
    if (fromStockGroup && toStockGroup) {
      // Create visual connection immediately
      const visualConnection = createConnection(fromStockGroup, toStockGroup, newConnection);
      paperState.current.connections.push(visualConnection);
      setConnections(prev => [...prev, visualConnection]);
      paper.view.draw();
    }
    // Update jsonData without triggering box recreation
    setJsonData(prev => ({
      ...prev,
      connections: [...prev.connections, newConnection]
    }));
    
    // Force a re-render to update the JSON editor
    paper.view.draw();
  };

  const cancelConnectionTool = () => {
    setCurrentMode('normal');
    setConnectionStart(null);
    if (tempConnectionLine) {
      tempConnectionLine.remove();
      setTempConnectionLine(null);
    }
  };

  // This ref will track if Paper.js has been initialized
  const paperInitialized = useRef(false);

  useEffect(() => {
    if (!canvasRef.current) {
      console.error('Canvas ref is null');
      return;
    }
    
    // Only do the full setup if Paper.js hasn't been initialized yet
    // This prevents clearing the canvas when toggling the JSON editor
    if (!paperInitialized.current) {
      console.log('Initializing Paper.js for the first time');
      paper.setup(canvasRef.current);
      paperInitialized.current = true;
    } else {
      console.log('Paper.js already initialized, just updating canvas');
      // If Paper.js is already initialized, just update the view
    }

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
      const boxHeight = 50; // Increased height to accommodate name and amount
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
      const stockAmount = stockData.amount || 0;
      const textLabel = new paper.PointText({
        point: [x, y - 5], // Offset text position slightly upward for better centering
        content: `${stockName}\n(${stockAmount})`,
        fillColor: 'black',
        fontSize: 10,
        justification: 'center'
      });

      const stockGroup = new paper.Group([stockBox, textLabel]);
      stockGroup.stockName = stockName;
      stockGroup.stockId = stockData.id;
      stockGroup.position = new paper.Point(x, y);

      // Add mode-based interaction logic
      let isDragging = false;
      let dragStarted = false;
      let offset = new paper.Point();

      stockGroup.onMouseDown = (event) => {
        // Use a function to get current mode to avoid closure issues
        const getCurrentMode = () => {
          const modeSelect = document.querySelector('select[value]');
          return modeSelect ? modeSelect.value : 'normal';
        };
        if (getCurrentMode() === 'connect') {
          // Disable dragging in connect mode
          return;
        }
        isDragging = true;
        dragStarted = false;
        offset = stockGroup.position.subtract(event.point);
        // Ensure selection is set on drag start
        setSelectedStock(stockData);
        setEditingStock({ ...stockData });
      };

      stockGroup.onMouseDrag = (event) => {
        // Use a function to get current mode to avoid closure issues
        const getCurrentMode = () => {
          const modeSelect = document.querySelector('select[value]');
          return modeSelect ? modeSelect.value : 'normal';
        };
        if (getCurrentMode() === 'connect') {
          // Disable dragging in connect mode
          return;
        }
        if (isDragging) {
          dragStarted = true;
          stockGroup.position = event.point.add(offset);
          const boxIndex = newBoxes.findIndex(b => b === stockGroup);
          updateConnectionsOnDrag(stockGroup, boxIndex);
        }
      };

      stockGroup.onMouseUp = (event) => {
        // Use a function to get current mode to avoid closure issues
        const getCurrentMode = () => {
          const modeSelect = document.querySelector('select[value]');
          return modeSelect ? modeSelect.value : 'normal';
        };
        if (getCurrentMode() === 'connect') {
          // Connection logic is now handled by canvas hit testing
          return;
        }
        
        isDragging = false;
        
        if (!dragStarted) {
          // This was a click, not a drag - handle selection
          setSelectedStock(stockData);
          setEditingStock({ ...stockData });
        } else {
          // This was a drag - keep selection after drag
          setSelectedStock(stockData);
          setEditingStock({ ...stockData });
        }
        
        dragStarted = false;
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
  }, [jsonData?.boxes, selectedBoxId]);

  // Handle connections changes separately to avoid recreating boxes
  useEffect(() => {
    if (!jsonData || !jsonData.connections || !paperState.current.boxes) return;
    
    // Remove existing connections
    paperState.current.connections.forEach(conn => {
      if (conn && conn.remove) {
        conn.remove();
      }
    });
    paperState.current.connections = [];
    
    // Recreate connections
    const newConnections = [];
    jsonData.connections.forEach((connData) => {
      const fromStock = paperState.current.boxes.find(box => box.stockId === connData.fromStockId);
      const toStock = paperState.current.boxes.find(box => box.stockId === connData.toStockId);
      if (fromStock && toStock) {
        // Always use fromStock as the first argument, toStock as the second
        const connection = createConnection(fromStock, toStock, connData);
        newConnections.push(connection);
      }
    });
    
    paperState.current.connections = newConnections;
    setConnections(newConnections);
    paper.view.draw();
  }, [jsonData?.connections]);

  // Keep editor value in sync with jsonData
  useEffect(() => {
    setEditorValue(JSON.stringify(jsonData, null, 2));
  }, [jsonData]);
  
  // Handle JSON editor visibility changes without clearing canvas
  useEffect(() => {
    // This effect runs after the DOM has been updated
    // We need to make sure the canvas is properly sized after toggling
    if (resizeCanvasRef.current) {
      // Use setTimeout to ensure this runs after the DOM update is complete
      setTimeout(() => {
        resizeCanvasRef.current();
        // Redraw the canvas with the current data
        drawAxes();
        paper.view.draw();
      }, 0);
    }
  }, [jsonEditorVisible]);

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
  
  // Mode system - only one mode can be active at a time
  const [currentMode, setCurrentMode] = useState('normal'); // 'normal', 'add', 'edit', 'connect'
  const [pendingStockData, setPendingStockData] = useState(null);
  const [connectionStart, setConnectionStart] = useState(null);
  const [tempConnectionLine, setTempConnectionLine] = useState(null);

  const addBoxWithNameAndAmount = (name, amount) => {
    console.log(`Preparing to add box with name: ${name}, amount: ${amount}`);
    // Set pending stock data and enable add mode
    setPendingStockData({ name, amount });
    setCurrentMode('add');
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
    
    // Reset pending state and return to normal mode
    setPendingStockData(null);
    setCurrentMode('normal');
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
    console.log('=== CREATING CONNECTION ===');
    console.log('From box (box1):', box1.stockId, 'position:', box1.position);
    console.log('To box (box2):', box2.stockId, 'position:', box2.position);
    
    const start = getEdgePoint(box1, box2); // from box1 (from) to box2 (to)
    const end = getEdgePoint(box2, box1);   // to box2 (to) from box1 (from)
    console.log('Start point (from):', start.x, start.y);
    console.log('End point (to):', end.x, end.y);
    
    const arrowSize = 8;
    // Calculate direction and snap to nearest axis (horizontal or vertical only)
    const rawDirection = end.subtract(start);
    console.log('Raw direction vector:', rawDirection.x, rawDirection.y);
    
    let direction;
    if (Math.abs(rawDirection.x) > Math.abs(rawDirection.y)) {
      // Horizontal direction
      direction = new paper.Point(rawDirection.x > 0 ? 1 : -1, 0);
      console.log('Arrow direction: HORIZONTAL', direction.x > 0 ? 'RIGHT' : 'LEFT');
    } else {
      // Vertical direction
      direction = new paper.Point(0, rawDirection.y > 0 ? 1 : -1);
      console.log('Arrow direction: VERTICAL', direction.y > 0 ? 'DOWN' : 'UP');
    }
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
      
      console.log('=== UPDATING CONNECTION DURING DRAG ===');
      console.log('Connection', i, 'from:', connData.fromStockId, 'to:', connData.toStockId);
      console.log('From box position:', fromBox.position);
      console.log('To box position:', toBox.position);
      
      // Ensure direction is consistent with connection data: from -> to
      const start = getEdgePoint(fromBox, toBox);
      const end = getEdgePoint(toBox, fromBox);
      console.log('Updated start point (from):', start.x, start.y);
      console.log('Updated end point (to):', end.x, end.y);
      
      const arrowSize = 8;
      // Calculate direction and snap to nearest axis (horizontal or vertical only)
      const rawDirection = end.subtract(start);
      console.log('Updated raw direction vector:', rawDirection.x, rawDirection.y);
      
      let direction;
      if (Math.abs(rawDirection.x) > Math.abs(rawDirection.y)) {
        // Horizontal direction
        direction = new paper.Point(rawDirection.x > 0 ? 1 : -1, 0);
        console.log('Updated arrow direction: HORIZONTAL', direction.x > 0 ? 'RIGHT' : 'LEFT');
      } else {
        // Vertical direction
        direction = new paper.Point(0, rawDirection.y > 0 ? 1 : -1);
        console.log('Updated arrow direction: VERTICAL', direction.y > 0 ? 'DOWN' : 'UP');
      }
      const perpendicular = new paper.Point(-direction.y, direction.x);
      const arrowBase = end.subtract(direction.multiply(arrowSize));
      // Ensure arrow points in correct direction: from -> to
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
      // Arrow always on 'to' side - maintain same segment order as creation
      const arrowHead = connection.children[1];
      if (arrowHead && arrowHead.segments) {
        // Match the creation order: [arrowTip, arrowLeft, arrowRight]
        arrowHead.segments[0].point = end;  // arrowTip
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

  // Toolbox rendering function
  const renderToolbox = () => (
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
          backgroundColor: currentMode === 'add' ? '#e0ffe0' : currentMode === 'connect' ? '#e0e0ff' : '#e0e0e0',
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
            currentMode === 'add' 
              ? <span style={{ color: '#4CAF50', fontWeight: 'bold' }}>Click to place: {pendingStockData?.name}</span>
              : currentMode === 'connect'
                ? <span style={{ color: '#2196F3', fontWeight: 'bold' }}>Connect Mode: {connectionStart ? 'Select target stock' : 'Select first stock'}</span>
                : selectedStock
                  ? <span style={{ color: '#ff6600', fontWeight: 'bold' }}>Selected: {selectedStock.name}</span>
                  : 'Stock Toolbox'
          )}

        </span>
        <div style={{ display: 'flex', gap: '5px' }}>
          {currentMode === 'add' && !toolboxCollapsed && (
            <button 
              onClick={() => {
                setCurrentMode('normal');
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
      {/* Toolbox content (copy from your main render) */}
      {!toolboxCollapsed && (
        <div style={{ padding: '10px' }}>
          <label htmlFor="mode-select" style={{ fontWeight: 'bold', marginRight: '8px' }}>Mode:</label>
          <select
            id="mode-select"
            value={currentMode}
            onChange={e => {
              setCurrentMode(e.target.value);
              // Reset any pending states when changing modes
              if (e.target.value !== 'add') {
                setPendingStockData(null);
              }
              if (e.target.value !== 'connect') {
                setConnectionStart(null);
                if (tempConnectionLine) {
                  tempConnectionLine.remove();
                  setTempConnectionLine(null);
                }
              }
            }}
            style={{ marginBottom: '10px', width: '100%' }}
          >
            <option value="normal">Normal</option>
            <option value="add">Add Stock</option>
            <option value="connect">Connect</option>
            <option value="edit">Edit</option>
          </select>
          {currentMode === 'add' && (
            <div style={{ marginTop: '10px' }}>
              <input
                type="text"
                placeholder="Stock Name"
                value={newStockName}
                onChange={e => setNewStockName(e.target.value)}
                style={{ width: '100%', marginBottom: '6px', padding: '4px' }}
              />
              <input
                type="number"
                placeholder="Amount"
                value={newStockAmount}
                onChange={e => setNewStockAmount(Number(e.target.value))}
                style={{ width: '100%', marginBottom: '6px', padding: '4px' }}
              />
              <button
                style={{ width: '100%', background: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px', padding: '6px', fontWeight: 'bold' }}
                onClick={() => {
                  if (newStockName && newStockAmount > 0) {
                    addBoxWithNameAndAmount(newStockName, newStockAmount);
                    setNewStockName('');
                    setNewStockAmount(0);
                  }
                }}
              >Add Stock</button>
            </div>
          )}
        </div>
      )}
    </div>
  );

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
      {/* Always render the canvas, only toggle the JSON editor */}
      <div style={{ width: jsonEditorVisible ? '75%' : '100%', height: '100%', position: 'absolute', left: 0, top: 0 }}>
        <canvas
          ref={canvasRef}
          id="myCanvas"
          resize="true"
          className={currentMode === 'add' ? 'stock-placement-cursor' : ''}
          style={{ 
            display: 'block', 
            width: '100%', 
            height: '100%',
            cursor: currentMode === 'add' ? 'crosshair' : currentMode === 'connect' ? 'crosshair' : 'default'
          }}
          onMouseMove={(e) => {
            if (currentMode === 'connect' && connectionStart && paper.project) {
              const rect = e.target.getBoundingClientRect();
              const x = e.clientX - rect.left;
              const y = e.clientY - rect.top;
              // Remove existing temp line
              if (tempConnectionLine) {
                tempConnectionLine.remove();
              }
              // Find the starting stock position
              const startStock = boxes.find(box => box.stockId === connectionStart);
              if (startStock) {
                const tempLine = new paper.Path.Line(
                  startStock.position,
                  new paper.Point(x, y)
                );
                tempLine.strokeColor = 'red';
                tempLine.strokeWidth = 2;
                tempLine.dashArray = [5, 5];
                setTempConnectionLine(tempLine);
                paper.view.draw();
              }
            }
          }}
          onClick={(e) => {
            if (currentMode === 'add' && pendingStockData) {
              // Get canvas-relative coordinates
              const rect = e.target.getBoundingClientRect();
              const x = e.clientX - rect.left;
              const y = e.clientY - rect.top;
              placeStockAtPosition(x, y);
            } else if (currentMode === 'connect') {
              // Get canvas-relative coordinates for hit testing
              const rect = e.target.getBoundingClientRect();
              const x = e.clientX - rect.left;
              const y = e.clientY - rect.top;
              const point = new paper.Point(x, y);
              
              // Use Paper.js hit testing to find clicked stock
              const hitResult = paper.project.hitTest(point);
              
              if (hitResult && hitResult.item) {
                console.log('Hit test result:', hitResult.item);
                
                // Try to find a stock by checking all boxes
                const clickedPoint = new paper.Point(x, y);
                console.log('Click coordinates:', x, y);
                let foundStock = null;
                
                // Check if the click is within any stock box bounds
                for (const box of paperState.current.boxes) {
                  console.log('Checking box', box.stockId, 'bounds:', box.bounds.toString(), 'contains click:', box.bounds.contains(clickedPoint));
                  if (box.bounds.contains(clickedPoint)) {
                    console.log('Found box containing click point:', box.stockId);
                    foundStock = box;
                    break;
                  }
                }
                
                if (foundStock) {
                  console.log('Found stock with ID:', foundStock.stockId);
                  // Found a stock, handle connection logic
                  handleConnectionClick(foundStock.stockId);
                } else {
                  // Try the original parent traversal method as fallback
                  let stockGroup = hitResult.item;
                  console.log('Starting parent traversal from:', stockGroup);
                  
                  // First try to find by stockId
                  while (stockGroup && !stockGroup.stockId) {
                    console.log('Traversing parent:', stockGroup.parent);
                    stockGroup = stockGroup.parent;
                  }
                  
                  if (stockGroup && stockGroup.stockId) {
                    console.log('Found stock with ID (via parent traversal):', stockGroup.stockId);
                    // Found a stock, handle connection logic
                    handleConnectionClick(stockGroup.stockId);
                  } else {
                    // If stockId not found, try to find by checking all boxes
                    console.log('No stockId found, checking all boxes');
                    let foundBox = null;
                    
                    for (const box of paperState.current.boxes) {
                      // Check if the hit result item is a child of this box
                      let isChild = false;
                      let currentItem = hitResult.item;
                      
                      while (currentItem && !isChild) {
                        if (currentItem === box || currentItem.parent === box) {
                          isChild = true;
                          break;
                        }
                        currentItem = currentItem.parent;
                      }
                      
                      if (isChild) {
                        console.log('Found box containing hit item:', box.stockId);
                        foundBox = box;
                        break;
                      }
                    }
                    
                    if (foundBox) {
                      console.log('Found stock with ID (via box search):', foundBox.stockId);
                      handleConnectionClick(foundBox.stockId);
                    } else {
                      console.log('No stock group found, canceling connection');
                      // Clicked on empty space or non-stock item, cancel connection
                      if (connectionStart) {
                        cancelConnectionTool();
                      }
                    }
                  }
                }
              } else {
                console.log('No hit result, canceling connection');
                // Clicked on empty space, cancel connection
                if (connectionStart) {
                  cancelConnectionTool();
                }
              }
              return;
            } else {
              // Get canvas-relative coordinates for hit testing
              const rect = e.target.getBoundingClientRect();
              const x = e.clientX - rect.left;
              const y = e.clientY - rect.top;
              const point = new paper.Point(x, y);
              // Use Paper.js hit testing to check if we clicked on any item
              const hitResult = paper.project.hitTest(point);
              // If no item was hit, or only axes were hit, clear selection
              if (!hitResult || (hitResult.item && hitResult.item.name === 'axis')) {
                setSelectedStock(null);
                setEditingStock(null);
              }
            }
          }}
        />
        {renderToolbox()}
      </div>
      {jsonEditorVisible && (
        <div style={{ position: 'absolute', right: 0, top: 0, width: '25%', height: '100%', borderLeft: '1px solid #ccc', display: 'flex', flexDirection: 'column', background: '#fff', zIndex: 2 }}>
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
      )}
      {/* JSON Editor Toggle Button - Positioned at bottom */}
      <button
        onClick={() => {
          setJsonEditorVisible(prev => !prev);
        }}
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          zIndex: 1000,
          padding: '10px 15px',
          backgroundColor: jsonEditorVisible ? '#ff6600' : '#4CAF50',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: 'bold',
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
        }}
        title={jsonEditorVisible ? 'Hide JSON Editor' : 'Show JSON Editor'}
      >
        {jsonEditorVisible ? '📝 Hide Editor' : '📝 Show Editor'}
      </button>
    </div>
  );
};

export default PaperCanvas;