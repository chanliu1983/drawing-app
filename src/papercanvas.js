import { useRef, useState, useEffect } from 'react';
import paper from 'paper';
import SplitPane from 'react-split-pane';
import Editor from '@monaco-editor/react';
// Removed initialData import - now loading from database
import dbService from './dbService';


const PaperCanvas = () => {
  const canvasRef = useRef(null);
  const resizeCanvasRef = useRef(null);
  const [boxes, setBoxes] = useState([]);
  const [connections, setConnections] = useState([]);
  const [jsonData, setJsonData] = useState({ boxes: [], connections: [] });
  const [editorValue, setEditorValue] = useState(JSON.stringify({ boxes: [], connections: [] }, null, 2));
  
  // Toolbox state
  const [toolboxCollapsed, setToolboxCollapsed] = useState(false);
  const [toolboxPosition, setToolboxPosition] = useState({ x: 10, y: 10 });
  // Removed selectedMode - using only currentMode for simplicity
  const [newStockName, setNewStockName] = useState('');
  const [newStockAmount, setNewStockAmount] = useState(0);
  const [newStockShape, setNewStockShape] = useState('rectangle'); // 'rectangle' or 'circle'
  const [selectedItem, setSelectedItem] = useState(null); // Unified selection for stock or connection
  const [editingItem, setEditingItem] = useState(null); // For editing form (stock or connection)
  const [selectedBoxId, setSelectedBoxId] = useState(null); // Track selected box
  // Removed editMode - now context-sensitive based on selection
  const [jsonEditorVisible, setJsonEditorVisible] = useState(true); // Control JSON editor visibility
  const [splitSize, setSplitSize] = useState('70%'); // Control split pane size
  
  // Canvas management state
  const [availableCanvases, setAvailableCanvases] = useState([]);
  const [currentCanvasName, setCurrentCanvasName] = useState('default');
  const [showNewCanvasDialog, setShowNewCanvasDialog] = useState(false);
  const [newCanvasName, setNewCanvasName] = useState('');
  
  // Simulation state
  const [simulationSteps, setSimulationSteps] = useState(0);
  const [targetSteps, setTargetSteps] = useState(1);

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

    if (!paper.view) return;
    
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
    if (!connectionStart) {
      // Start a new connection
      setConnectionStart(stockId);
    } else {
      // Complete the connection
      createNewConnection(connectionStart, stockId);
      // Switch back to normal mode after creating connection
      setCurrentMode('normal');
      // Reset connection state
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
    const connectionName = fromStockData && toStockData ? `${fromStockData.name} -> ${toStockData.name}` : `Connection ${maxId + 1}`;
    
    // Check if either stock is infinite (circle shape)
    const isFromInfinite = fromStockData && fromStockData.shape === 'circle';
    const isToInfinite = toStockData && toStockData.shape === 'circle';
    
    // Default values for deductAmount and transferAmount
    // Using numbers by default for new connections
    const deductAmount = 1;
    const transferAmount = 1;
    
    const newConnection = {
      id: maxId + 1,
      name: connectionName,
      type: "feedback_loop",
      fromStockId: fromStockId,
      toStockId: toStockId,
      deductAmount: deductAmount, // Amount deducted from source stock
      transferAmount: transferAmount // Amount added to destination stock
    };
    // Find the stock groups for visual connection
    const fromStockGroup = paperState.current.boxes.find(box => box.stockId === fromStockId);
    const toStockGroup = paperState.current.boxes.find(box => box.stockId === toStockId);
    if (fromStockGroup && toStockGroup) {
      // Create visual connection immediately
      const visualConnection = createConnection(fromStockGroup, toStockGroup, newConnection);
      paperState.current.connections.push(visualConnection);
      setConnections(prev => [...prev, visualConnection]);
      if (paper.view) paper.view.draw();
    }
    // Update jsonData without triggering box recreation
    setJsonData(prev => ({
      ...prev,
      connections: [...prev.connections, newConnection]
    }));
    
    // Force a re-render to update the JSON editor
    if (paper.view) paper.view.draw();
  };

  const cancelConnectionTool = () => {
    setCurrentMode('normal');
    setConnectionStart(null);
    if (tempConnectionLine) {
      tempConnectionLine.remove();
      setTempConnectionLine(null);
    }
  };

  // Canvas management functions
  const loadAvailableCanvases = async () => {
    try {
      const canvasNames = await dbService.getAllCanvasNames();
      setAvailableCanvases(canvasNames);
    } catch (error) {
      console.error('Failed to load available canvases:', error);
    }
  };

  const saveCurrentCanvas = async (name = currentCanvasName) => {
    console.log('Save button clicked! Current canvas name:', name);
    console.log('Current jsonData:', jsonData);
    try {
      await dbService.saveCanvas(name, jsonData);

      if (!availableCanvases.includes(name)) {
        setAvailableCanvases(prev => [...prev, name].sort());
      }
    } catch (error) {
      console.error('Failed to save canvas:', error);
    }
  };

  // Helper function to ensure all boxes have simulationAmount initialized
  const ensureSimulationAmount = (data) => {
    if (data && data.boxes) {
      return {
        ...data,
        boxes: data.boxes.map(box => ({
          ...box,
          // Initialize simulationAmount to amount if not set
          simulationAmount: box.simulationAmount !== undefined ?
            box.simulationAmount :
            box.amount
        }))
      };
    }
    return data;
  };

  const loadCanvas = async (name) => {
    try {
      const canvasData = await dbService.loadCanvas(name);
      if (canvasData) {
        const dataWithSimulation = ensureSimulationAmount(canvasData);
        setJsonData(dataWithSimulation);
        setEditorValue(JSON.stringify(dataWithSimulation, null, 2));
        setCurrentCanvasName(name);

      } else {

      }
    } catch (error) {
      console.error('Failed to load canvas:', error);
      alert('Failed to load canvas. Please try again.');
    }
  };

  const createNewCanvas = async (name) => {
    if (!name.trim()) {
      alert('Please enter a canvas name');
      return;
    }
    
    if (await dbService.canvasExists(name)) {
      alert('A canvas with this name already exists');
      return;
    }

    const newCanvasData = {
      boxes: [],
      connections: []
    };
    
    try {
      await dbService.saveCanvas(name, newCanvasData);
      setJsonData(newCanvasData);
      setEditorValue(JSON.stringify(newCanvasData, null, 2));
      setCurrentCanvasName(name);
      setAvailableCanvases(prev => [...prev, name].sort());
      setShowNewCanvasDialog(false);
      setNewCanvasName('');

    } catch (error) {
      console.error('Failed to create new canvas:', error);
      alert('Failed to create new canvas. Please try again.');
    }
  };

  const handleCanvasSelection = (selectedValue) => {
    if (selectedValue === 'new_canvas') {
      setShowNewCanvasDialog(true);
    } else {
      loadCanvas(selectedValue);
    }
  };

  // This ref will track if Paper.js has been initialized
  const paperInitialized = useRef(false);

  // Initialize database and load available canvases
  useEffect(() => {
    const initializeDatabase = async () => {
      try {
        await dbService.init();
        await loadAvailableCanvases();
        
        // Save the default canvas if it doesn't exist
        if (!(await dbService.canvasExists('default'))) {
          const defaultData = { boxes: [], connections: [] };
          await dbService.saveCanvas('default', defaultData);
          setAvailableCanvases(prev => ['default', ...prev].sort());
        }
      } catch (error) {
        console.error('Failed to initialize database:', error);
      }
    };
    
    initializeDatabase();
  }, []);

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
      
      // Add canvas dragging functionality in normal mode
      const tool = new paper.Tool();
      let lastPoint = null;
      
      tool.onMouseDown = (event) => {
        // Get current mode
        const getCurrentMode = () => {
          const modeSelect = document.querySelector('#mode-select');
          return modeSelect ? modeSelect.value : 'normal';
        };
        
        // Only enable canvas dragging in normal mode
        if (getCurrentMode() === 'normal') {
          // Check if we're clicking on empty space (not on any item)
          const hitResult = paper.project.hitTest(event.point);
          if (!hitResult || (hitResult.item && hitResult.item.name === 'axis')) {
            lastPoint = event.point.clone();
          }
        }
      };
      
      tool.onMouseDrag = (event) => {
        // Get current mode
        const getCurrentMode = () => {
          const modeSelect = document.querySelector('#mode-select');
          return modeSelect ? modeSelect.value : 'normal';
        };
        
        // Only enable canvas dragging in normal mode
        if (getCurrentMode() === 'normal' && lastPoint) {
          // Calculate the delta movement
          const delta = event.point.subtract(lastPoint);
          
          // Move all items in the project
          paper.project.getItems().forEach(item => {
            item.position = item.position.add(delta);
          });
          
          // Update lastPoint for the next drag event
          lastPoint = event.point.clone();
          
          // Update the JSON data to reflect the new positions
          setJsonData(prev => {
            const newBoxes = prev.boxes.map(box => {
              const paperBox = paperState.current.boxes.find(pb => pb.stockId === box.id);
              if (paperBox) {
                return {
                  ...box,
                  position: {
                    x: Math.round(paperBox.position.x),
                    y: Math.round(paperBox.position.y)
                  }
                };
              }
              return box;
            });
            return { ...prev, boxes: newBoxes };
          });
          
          // Redraw the view
          paper.view.draw();
        }
      };
      
      tool.onMouseUp = () => {
        lastPoint = null;
      };
    } else {

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
        
        const end = getEdgePoint(fromStock, toStock);
        const start = getEdgePoint(toStock, fromStock);
        
        // Calculate direction and apply direction-based handle logic
        const arrowSize = 8;
        const rawDirection = end.subtract(start);
        let direction;
        if (Math.abs(rawDirection.x) > Math.abs(rawDirection.y)) {
          direction = new paper.Point(rawDirection.x > 0 ? 1 : -1, 0);
        } else {
          direction = new paper.Point(0, rawDirection.y > 0 ? 1 : -1);
        }
        const arrowBase = end.subtract(direction.multiply(arrowSize));
        
        // Handle calculations should follow the arrow direction
        let handle1, handle2;
        if (Math.abs(direction.x) > 0) {
          // Horizontal arrow - curve should be vertical
          handle1 = new paper.Point((start.x + arrowBase.x) / 2, start.y);
          handle2 = new paper.Point((start.x + arrowBase.x) / 2, arrowBase.y);
        } else {
          // Vertical arrow - curve should be horizontal
          handle1 = new paper.Point(start.x, (start.y + arrowBase.y) / 2);
          handle2 = new paper.Point(arrowBase.x, (start.y + arrowBase.y) / 2);
        }

        // Access the path (first child) from the connection group
        const path = connection.children[0];
        if (path && path.segments && path.segments.length === 2) {
          path.segments[0].point = start;
          path.segments[1].point = arrowBase;
          path.segments[0].handleOut = handle1.subtract(start);
          path.segments[1].handleIn = handle2.subtract(arrowBase);
        }
        
        // Update arrow head (second child) with proper direction-based calculations
        const arrowHead = connection.children[1];
        if (arrowHead && arrowHead.segments) {
          const perpendicular = new paper.Point(-direction.y, direction.x);
          const arrowLeft = arrowBase.add(perpendicular.multiply(arrowSize/2));
          const arrowRight = arrowBase.subtract(perpendicular.multiply(arrowSize/2));
          arrowHead.segments[0].point = end;  // arrowTip
          arrowHead.segments[1].point = arrowLeft;
          arrowHead.segments[2].point = arrowRight;
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
          // Update Paper.js objects only - avoid triggering useEffect re-render
          paperState.current.boxes.forEach(box => {
            box.position.y += deltaY;
          });
          // Also update jsonData.boxes positions to match Paper.js box positions
          setJsonData(prev => {
            const newBoxes = prev.boxes.map(box => {
              const paperBox = paperState.current.boxes.find(pb => pb.stockId === box.id);
              if (paperBox) {
                return {
                  ...box,
                  position: {
                    x: Math.round(paperBox.position.x),
                    y: Math.round(paperBox.position.y)
                  }
                };
              }
              return box;
            });
            return { ...prev, boxes: newBoxes };
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
      if (paper.view) {
        paper.view.setViewSize(new paper.Size(newWidth, newHeight));
      }
      
      // Ensure pixel ratio is maintained
      const pixelRatio = window.devicePixelRatio || 1;
      canvasRef.current.style.width = newWidth + 'px';
      canvasRef.current.style.height = newHeight + 'px';
      canvasRef.current.width = newWidth * pixelRatio;
      canvasRef.current.height = newHeight * pixelRatio;
      if (paper.view) {
        paper.view.setViewSize(new paper.Size(newWidth, newHeight));
      }
      
      const ctx = canvasRef.current.getContext('2d');
      ctx.scale(pixelRatio, pixelRatio);
      
      updateConnectionsForResize();
      drawAxes();
      if (paper.view) paper.view.draw();
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
      if (paper.view) paper.view.draw();
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
      const x = stockData.position?.x || Math.random() * ((paper.view?.size?.width || 800) - boxWidth);
      const y = stockData.position?.y || Math.random() * ((paper.view?.size?.height || 600) - boxHeight);

      const isSelected = selectedBoxId === stockData.id;
      const isCircle = stockData.shape === 'circle';
      
      let stockBox;
      if (isCircle) {
        // Create circle for infinite stocks
        const radius = Math.max(boxWidth, boxHeight) / 2;
        stockBox = new paper.Path.Circle({
          center: [x, y],
          radius: radius,
          fillColor: isSelected ? '#ffe082' : 'lightgreen', // Different color for infinite stocks
          strokeColor: isSelected ? '#ff9800' : 'green',
          strokeWidth: isSelected ? 3 : 2
        });
      } else {
        // Create rectangle for finite stocks
        stockBox = new paper.Path.Rectangle({
          point: [x - boxWidth/2, y - boxHeight/2],
          size: [boxWidth, boxHeight],
          fillColor: isSelected ? '#ffe082' : 'lightblue',
          strokeColor: isSelected ? '#ff9800' : 'blue',
          strokeWidth: isSelected ? 3 : 2
        });
      }

      const stockName = stockData.name || `Stock ${index + 1}`;
      let displayText;
      let textColor = 'black';
      let fontWeight = 'normal';

      // Handle infinite stocks
      if (stockData.shape === 'circle') {
        displayText = `${stockName}\n∞`;
      }
      // Handle stocks with simulation amounts
      else if (stockData.simulationAmount !== undefined) {
        const simAmount = typeof stockData.simulationAmount === 'number' ?
          stockData.simulationAmount : stockData.simulationAmount;
        displayText = `${stockName}\n${simAmount} / ${stockData.amount}`;
        
        // Highlight changed amounts
        if (stockData.simulationAmount !== stockData.amount) {
          textColor = '#FF6600';
          fontWeight = 'bold';
        }
      }
      // Regular stocks
      else {
        displayText = `${stockName}\n${stockData.amount}`;
      }

      // Create text label with simulation amount
      const textLabel = new paper.PointText({
        point: [x, y - 5],
        content: displayText,
        fillColor: textColor,
        fontSize: 10,
        fontWeight: fontWeight,
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
      const modeSelect = document.querySelector('#mode-select');
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
        setSelectedItem({ ...stockData, type: 'stock' });
        setEditingItem({ ...stockData, type: 'stock' });
        setSelectedBoxId(stockData.id);
      };

      stockGroup.onMouseDrag = (event) => {
        // Use a function to get current mode to avoid closure issues
        const getCurrentMode = () => {
          const modeSelect = document.querySelector('#mode-select');
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
          const modeSelect = document.querySelector('#mode-select');
          return modeSelect ? modeSelect.value : 'normal';
        };
        if (getCurrentMode() === 'connect') {
          // Connection logic is now handled by canvas hit testing
          return;
        }
        
        isDragging = false;
        
        if (!dragStarted) {
          // This was a click, not a drag - handle selection
          setSelectedItem({ ...stockData, type: 'stock' });
          setEditingItem({ ...stockData, type: 'stock' });
          setSelectedBoxId(stockData.id);
        } else {
          // This was a drag - keep selection after drag
          setSelectedItem({ ...stockData, type: 'stock' });
        setEditingItem({ ...stockData, type: 'stock' });
        setSelectedBoxId(stockData.id);
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
    if (paper.view) paper.view.draw();
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
    if (paper.view) paper.view.draw();
  }, [jsonData?.connections]);

  // Keep editor value in sync with jsonData
  useEffect(() => {
    console.log("jsonData changed, updating editor value");
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
        if (paper.view) paper.view.draw();
      }, 0);
    }
  }, [jsonEditorVisible]);

  
  // Mode system - only one mode can be active at a time
  const [currentMode, setCurrentMode] = useState('normal'); // 'normal', 'add', 'edit', 'connect'
  const [pendingStockData, setPendingStockData] = useState(null);
  const [connectionStart, setConnectionStart] = useState(null);
  const [tempConnectionLine, setTempConnectionLine] = useState(null);

  const addBoxWithNameAndAmount = (name, amount, shape = 'rectangle') => {

    // Set pending stock data and enable add mode
    setPendingStockData({ name, amount, shape });
    setCurrentMode('add');
    // No alert - we'll use a custom cursor instead
  };
  
  const placeStockAtPosition = (x, y) => {
    if (!pendingStockData) return;
    

    // Generate a unique stock ID
    const maxId = Math.max(0, ...jsonData.boxes.map(b => b.id || 0));
    const newStock = {
      id: maxId + 1,
      name: pendingStockData.name,
      type: 'stock',
      shape: pendingStockData.shape || 'rectangle',
      amount: pendingStockData.shape === 'circle' ? '∞' : pendingStockData.amount,
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

  const createSelfConnection = (box, connectionData = null) => {
    
    const boxBounds = box.bounds;
    const boxCenter = box.position;
    const loopRadius = 150; // Radius of the self-connection loop
    const arrowSize = 8;
    
    // Position the loop on the right side of the box
    const startPoint = new paper.Point(boxBounds.right, boxCenter.y);
    const endPoint = new paper.Point(boxBounds.right, boxCenter.y - 5); // Slightly offset for arrow
    
    // Create control points for a circular loop
    const controlOffset = loopRadius;
    const control1 = new paper.Point(boxBounds.right + controlOffset, boxCenter.y - controlOffset);
    const control2 = new paper.Point(boxBounds.right + controlOffset, boxCenter.y + controlOffset);
    
    // Create the curved path
    const path = new paper.Path({
      strokeColor: 'black',
      strokeWidth: 2
    });
    
    path.moveTo(startPoint);
    path.cubicCurveTo(control1, control2, endPoint);
    
    // Create arrow at the end point
    const arrowDirection = new paper.Point(-1, 0); // Pointing left into the box
    const perpendicular = new paper.Point(0, -1); // Perpendicular for arrow wings
    
    const arrowTip = endPoint;
    const arrowBase = arrowTip.subtract(arrowDirection.multiply(arrowSize));
    const arrowLeft = arrowBase.add(perpendicular.multiply(arrowSize/2));
    const arrowRight = arrowBase.subtract(perpendicular.multiply(arrowSize/2));
    
    const arrowHead = new paper.Path({
      segments: [arrowTip, arrowLeft, arrowRight],
      strokeColor: 'black',
      strokeWidth: 2,
      fillColor: 'black',
      closed: true
    });
    
    // Add connection name label if provided
    let nameLabel = null;
    let labelHitBox = null;
    if (connectionData && connectionData.name) {
      const labelPosition = new paper.Point(boxBounds.right + loopRadius, boxCenter.y);
      let displayText = connectionData.name;
      
      // Default values if not specified - support both numeric and percentage values
      const deductAmount = connectionData.deductAmount !== undefined ? connectionData.deductAmount : 1;
      const transferAmount = connectionData.transferAmount !== undefined ? connectionData.transferAmount : 1;
      
      // Always show both amounts in the label
      displayText = `${connectionData.name} (-${deductAmount}/+${transferAmount})`;
      nameLabel = new paper.PointText({
        point: labelPosition,
        content: displayText,
        fillColor: 'black',
        fontSize: 12,
        justification: 'center'
      });
      
      // Create a dotted bounding box around the text for better hit testing
      const textBounds = nameLabel.bounds;
      const padding = 4; // Add some padding around the text
      labelHitBox = new paper.Path.Rectangle({
        rectangle: new paper.Rectangle(
          textBounds.x - padding,
          textBounds.y - padding,
          textBounds.width + (padding * 2),
          textBounds.height + (padding * 2)
        ),
        strokeColor: '#cccccc', // Light gray dotted border
        strokeWidth: 1,
        dashArray: [2, 2],
        fillColor: 'transparent'
      });
    }
    
    // Add click handler for self-connection selection
     const handleSelfConnectionSelect = (event) => {
      // Use a function to get current mode to avoid closure issues
      const getCurrentMode = () => {
        const modeSelect = document.querySelector('#mode-select');
        return modeSelect ? modeSelect.value : 'normal';
      };
      console.log('Self-connection clicked, current mode:', getCurrentMode());
      if (getCurrentMode() === 'edit') {
         // Use Paper.js hit testing with tolerance for better accuracy
         const hitPoint = event.point || (event.event && event.event.point);
         if (hitPoint) {
           const hitResult = path.hitTest(hitPoint, {
             stroke: true,
             tolerance: 10 // Increase tolerance for easier clicking
           });
           if (hitResult || path.bounds.contains(hitPoint)) {
             // Get connectionData from the group that will be created
             const groupConnectionData = event.target.parent?.connectionData || connectionData;
             console.log('Self-connection groupConnectionData:', groupConnectionData);
             console.log('Self-connection connectionData fallback:', connectionData);
             if (groupConnectionData) {
               // Ensure deductAmount and transferAmount are defined with defaults if missing
               const enhancedData = {
                 ...groupConnectionData,
                 type: 'connection',
                 deductAmount: groupConnectionData.deductAmount !== undefined ? groupConnectionData.deductAmount : 1,
                 transferAmount: groupConnectionData.transferAmount !== undefined ? groupConnectionData.transferAmount : 1
               };
               console.log("Selected self-connection with enhanced data:", enhancedData);
               setSelectedItem(enhancedData);
               setEditingItem(enhancedData);
             } else {
               setSelectedItem(null);
               setEditingItem(null);
             }
             setSelectedBoxId(null);
           }
         }
       }
     };
    
    // Simplified handler for direct clicks on arrow and labels
     const handleDirectSelect = (event) => {
       // Use a function to get current mode to avoid closure issues
       const getCurrentMode = () => {
         const modeSelect = document.querySelector('#mode-select');
         return modeSelect ? modeSelect.value : 'normal';
       };
       if (getCurrentMode() === 'edit') {
         // Get connectionData from the group
         const groupConnectionData = event.target.parent?.connectionData || connectionData;
         if (groupConnectionData) {
           // Ensure deductAmount and transferAmount are defined with defaults if missing
           const enhancedData = {
             ...groupConnectionData,
             type: 'connection',
             deductAmount: groupConnectionData.deductAmount !== undefined ? groupConnectionData.deductAmount : 1,
             transferAmount: groupConnectionData.transferAmount !== undefined ? groupConnectionData.transferAmount : 1
           };
           console.log("Selected connection with enhanced data:", enhancedData);
           setSelectedItem(enhancedData);
           setEditingItem(enhancedData);
         } else {
           setSelectedItem(null);
           setEditingItem(null);
         }
         setSelectedBoxId(null);
       }
     };
     
     path.onMouseDown = handleSelfConnectionSelect;
     arrowHead.onMouseDown = handleDirectSelect;
     if (nameLabel) {
       nameLabel.onMouseDown = handleDirectSelect;
     }
     if (labelHitBox) {
       labelHitBox.onMouseDown = handleDirectSelect;
     }
    
    const connectionGroup = nameLabel ? 
      (labelHitBox ? new paper.Group([path, arrowHead, nameLabel, labelHitBox]) : new paper.Group([path, arrowHead, nameLabel])) : 
      new paper.Group([path, arrowHead]);
    
    if (connectionData) {
      connectionGroup.connectionData = connectionData;
    }
    
    // Add group handler for fallback
    connectionGroup.onMouseDown = handleSelfConnectionSelect;
    
    return connectionGroup;
  };

  const createConnection = (box1, box2, connectionData = null) => {
    // Check if this is a self-connection
    const isSelfConnection = box1.stockId === box2.stockId;
    
    if (isSelfConnection) {
      return createSelfConnection(box1, connectionData);
    }
    
    const end = getEdgePoint(box1, box2); // from box1 (from) to box2 (to)
    const start = getEdgePoint(box2, box1);   // to box2 (to) from box1 (from)
    
    const arrowSize = 8;
    // Calculate direction and snap to nearest axis (horizontal or vertical only)
    const rawDirection = end.subtract(start);
    
    let direction;
    if (Math.abs(rawDirection.x) > Math.abs(rawDirection.y)) {
      // Horizontal direction
      direction = new paper.Point(rawDirection.x > 0 ? 1 : -1, 0);
    } else {
      // Vertical direction
      direction = new paper.Point(0, rawDirection.y > 0 ? 1 : -1);
    }
    const perpendicular = new paper.Point(-direction.y, direction.x);
    // Calculate the base of the arrowhead
    const arrowBase = end.subtract(direction.multiply(arrowSize));
    const arrowLeft = arrowBase.add(perpendicular.multiply(arrowSize/2));
    const arrowRight = arrowBase.subtract(perpendicular.multiply(arrowSize/2));
    // The curve should end at the base of the arrow, not the box
    // Handle calculations should follow the arrow direction
    let handle1, handle2;
    if (Math.abs(direction.x) > 0) {
      // Horizontal arrow - curve should be vertical
      handle1 = new paper.Point((start.x + arrowBase.x) / 2, start.y);
      handle2 = new paper.Point((start.x + arrowBase.x) / 2, arrowBase.y);
    } else {
      // Vertical arrow - curve should be horizontal
      handle1 = new paper.Point(start.x, (start.y + arrowBase.y) / 2);
      handle2 = new paper.Point(arrowBase.x, (start.y + arrowBase.y) / 2);
    }
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
    let labelHitBox = null;
    if (connectionData && connectionData.name) {
      const midPoint = start.add(arrowBase).divide(2);
      let displayText = connectionData.name;
      
      // Default values if not specified
      const deductAmount = connectionData.deductAmount !== undefined ? connectionData.deductAmount : 1;
      const transferAmount = connectionData.transferAmount !== undefined ? connectionData.transferAmount : 1;
      
      // Find the source and target stocks to check if they're infinite
      const fromStockId = connectionData.fromStockId;
      const toStockId = connectionData.toStockId;
      
      // Find the stock data from jsonData
      const fromStock = jsonData.boxes.find(box => box.id === fromStockId);
      const toStock = jsonData.boxes.find(box => box.id === toStockId);
      
      const isFromInfinite = fromStock && fromStock.shape === 'circle';
      const isToInfinite = toStock && toStock.shape === 'circle';
      
      // Customize label based on infinite stock connections
      if (isFromInfinite && !isToInfinite) {
        // From infinite to normal: only show transfer amount
        displayText = `${connectionData.name} (∞/+${transferAmount})`;
      } else if (!isFromInfinite && isToInfinite) {
        // From normal to infinite: only show deduct amount
        displayText = `${connectionData.name} (-${deductAmount}/∞)`;
      } else if (isFromInfinite && isToInfinite) {
        // Both infinite: show infinity symbols
        displayText = `${connectionData.name} (∞/∞)`;
      } else {
        // Normal case: show both amounts
        displayText = `${connectionData.name} (-${deductAmount}/+${transferAmount})`;
      }
      
      nameLabel = new paper.PointText({
        point: midPoint.add(new paper.Point(0, -10)),
        content: displayText,
        fillColor: 'black',
        fontSize: 12,
        justification: 'center'
      });
      
      // Create a dotted bounding box around the text for better hit testing
      const textBounds = nameLabel.bounds;
      const padding = 4; // Add some padding around the text
      labelHitBox = new paper.Path.Rectangle({
         rectangle: new paper.Rectangle(
           textBounds.x - padding,
           textBounds.y - padding,
           textBounds.width + (padding * 2),
           textBounds.height + (padding * 2)
         ),
         strokeColor: '#cccccc', // Light gray dotted border
         strokeWidth: 1,
         dashArray: [2, 2],
         fillColor: 'transparent'
       });
    }
    // Add click handler for connection selection to all relevant items
    const handleConnectionSelect = (event) => {
      // Use a function to get current mode to avoid closure issues
      const getCurrentMode = () => {
        const modeSelect = document.querySelector('#mode-select');
        return modeSelect ? modeSelect.value : 'normal';
      };
      if (getCurrentMode() === 'edit') {
        // Use Paper.js hit testing with tolerance for better accuracy
        const hitPoint = event.point || (event.event && event.event.point);
        if (hitPoint) {
          const hitResult = path.hitTest(hitPoint, {
            stroke: true,
            tolerance: 10 // Increase tolerance for easier clicking
          });
          if (hitResult || path.bounds.contains(hitPoint)) {
            // Get connectionData from the group that will be created
            const groupConnectionData = event.target.parent?.connectionData || connectionData;
            
            if (groupConnectionData) {
              // Ensure deductAmount and transferAmount have default values if missing
              // Preserve string format for percentage values
              const deductAmount = groupConnectionData.deductAmount !== undefined ? 
                groupConnectionData.deductAmount : 1;
                
              const transferAmount = groupConnectionData.transferAmount !== undefined ? 
                groupConnectionData.transferAmount : 1;
              
              // Create a properly initialized selection object
              const selectionData = {
                ...groupConnectionData,
                type: 'connection',
                deductAmount: deductAmount,
                transferAmount: transferAmount
              };
              
              console.log("Selected connection with initialized values:", selectionData);
              
              setSelectedItem(selectionData);
              setEditingItem(selectionData);
              setSelectedBoxId(null);
            }
          }
        }
      }
    };
    // Simplified handler for direct clicks on arrow and labels
    const handleDirectSelect = (event) => {
      if (currentMode === 'edit') {
        // Get connectionData from the group
        const groupConnectionData = event.target.parent?.connectionData || connectionData;
        
        if (groupConnectionData) {
          // Ensure deductAmount and transferAmount have default values if missing
          // Preserve string format for percentage values
          const deductAmount = groupConnectionData.deductAmount !== undefined ? 
            groupConnectionData.deductAmount : 1;
            
          const transferAmount = groupConnectionData.transferAmount !== undefined ? 
            groupConnectionData.transferAmount : 1;
          
          // Create a properly initialized selection object
          const selectionData = {
            ...groupConnectionData,
            type: 'connection',
            deductAmount: deductAmount,
            transferAmount: transferAmount
          };
          
          console.log("Direct selected connection with initialized values:", selectionData);
          
          setSelectedItem(selectionData);
          setEditingItem(selectionData);
          setSelectedBoxId(null);
        }
      }
    };
    
    path.onMouseDown = handleConnectionSelect;
    arrowHead.onMouseDown = handleDirectSelect;
    if (nameLabel) {
      nameLabel.onMouseDown = handleDirectSelect;
    }
    if (labelHitBox) {
      labelHitBox.onMouseDown = handleDirectSelect;
    }
    const connectionGroup = nameLabel ? 
      (labelHitBox ? new paper.Group([path, arrowHead, nameLabel, labelHitBox]) : new paper.Group([path, arrowHead, nameLabel])) : 
      new paper.Group([path, arrowHead]);
    if (connectionData) {
      connectionGroup.connectionData = connectionData;
    }
    // Optionally, keep group handler for fallback
    connectionGroup.onMouseDown = handleConnectionSelect;
    return connectionGroup;
  };

  const refreshConnections = (updatedJsonData) => {
    console.log("refreshConnections called with data:", updatedJsonData);
    
    // Remove existing connections
    paperState.current.connections.forEach(conn => conn.remove());
    const newConnections = [];
    
    // Recreate connections with updated data
    if (updatedJsonData.connections) {
      console.log("Processing", updatedJsonData.connections.length, "connections");
      updatedJsonData.connections.forEach(connData => {
        console.log("Creating connection:", connData);
        const fromStock = paperState.current.boxes.find(box => box.stockId === connData.fromStockId);
        const toStock = paperState.current.boxes.find(box => box.stockId === connData.toStockId);
        
        if (fromStock && toStock) {
          console.log(`Found stock objects - from: ${connData.fromStockId}, to: ${connData.toStockId}`);
          const connection = createConnection(fromStock, toStock, connData);
          newConnections.push(connection);
        } else {
          console.warn(`Could not find stock objects for connection - from: ${connData.fromStockId}, to: ${connData.toStockId}`);
        }
      });
    }
    
    console.log("Created", newConnections.length, "new connections");
    paperState.current.connections = newConnections;
    setConnections(newConnections);
    if (paper.view) {
      console.log("Drawing paper view");
      paper.view.draw();
    } else {
      console.warn("paper.view is not available");
    }
  };

  const runSimulation = () => {
    if (!jsonData || !jsonData.connections || !jsonData.boxes) return;
    
    // Create a copy of the current stock amounts
    // Use amount as original, simulationAmount for simulation values
    const updatedBoxes = jsonData.boxes.map(box => {
      console.log(`Processing box ${box.name} for simulation:`, {
        id: box.id,
        amount: box.amount,
        simulationAmount: box.simulationAmount
      });
      
      return {
        ...box,
        simulationAmount: box.simulationAmount !== undefined ? box.simulationAmount : box.amount // Initialize simulation amount if needed
      };
    });
    
    // Group connections by type for ordered processing
    const connections = [...jsonData.connections];
    const outflowFromCircles = connections.filter(conn => {
      const fromStock = updatedBoxes.find(box => box.id === conn.fromStockId);
      return fromStock && fromStock.shape === 'circle';
    });
    
    const inflowToCircles = connections.filter(conn => {
      const toStock = updatedBoxes.find(box => box.id === conn.toStockId);
      return toStock && toStock.shape === 'circle';
    }).filter(conn => {
      // Exclude connections that are already in outflowFromCircles
      const fromStock = updatedBoxes.find(box => box.id === conn.fromStockId);
      return !(fromStock && fromStock.shape === 'circle');
    });
    
    const otherConnections = connections.filter(conn => {
      const fromStock = updatedBoxes.find(box => box.id === conn.fromStockId);
      const toStock = updatedBoxes.find(box => box.id === conn.toStockId);
      return !(fromStock && fromStock.shape === 'circle') && !(toStock && toStock.shape === 'circle');
    });
    
    // Process connections in the specified order: outflow from circles, other connections, inflow to circles
    const orderedConnections = [...outflowFromCircles, ...otherConnections, ...inflowToCircles];
    
    // Process each connection in the ordered sequence
    orderedConnections.forEach(connection => {
      const fromStock = updatedBoxes.find(box => box.id === connection.fromStockId);
      const toStock = updatedBoxes.find(box => box.id === connection.toStockId);
      
      // Preserve the original format (number or percentage string)
      const deductAmountRaw = connection.deductAmount !== undefined && connection.deductAmount !== null ? 
        connection.deductAmount : 1;
      const transferAmountRaw = connection.transferAmount !== undefined && connection.transferAmount !== null ? 
        connection.transferAmount : 1;
      
      if (fromStock && toStock) {
        // Handle special cases for infinite stocks (circle shape)
        const isFromInfinite = fromStock.shape === 'circle';
        const isToInfinite = toStock.shape === 'circle';
        
        // Calculate actual deduct amount based on whether it's percentage or fixed
        let actualDeductAmount = 0;
        if (!isFromInfinite) { // Only calculate deduct amount if source is not infinite
          if (typeof deductAmountRaw === 'string' && deductAmountRaw.includes('%')) {
            // Percentage-based deduction
            const percentageStr = deductAmountRaw.replace('%', '');
            const percentage = parseFloat(percentageStr) / 100;
            actualDeductAmount = fromStock.simulationAmount * percentage;
          } else {
            // Fixed amount deduction
            actualDeductAmount = Number(deductAmountRaw);
          }
          
          // Check if source has sufficient amount for deduction
          const currentAmount = typeof fromStock.simulationAmount === 'number' ? 
            fromStock.simulationAmount : parseFloat(fromStock.simulationAmount);
          
          if (currentAmount < actualDeductAmount) {
            // If insufficient amount, limit deduction to available amount
            actualDeductAmount = Math.max(0, currentAmount);
            console.log(`Insufficient amount in ${fromStock.name}. Limited deduction to ${actualDeductAmount}`);
          }
          
          // Skip this connection entirely if no amount can be deducted
          if (actualDeductAmount <= 0) {
            console.log(`Connection from ${fromStock.name} to ${toStock.name} is inactive - no deductible amount`);
            return; // Skip this connection
          }
        }
        
        // Calculate actual transfer amount based on whether it's percentage or fixed
        let actualTransferAmount = 0;
        if (!isToInfinite) { // Only calculate transfer amount if destination is not infinite
          if (typeof transferAmountRaw === 'string' && transferAmountRaw.includes('%')) {
            // Percentage-based transfer
            const percentageStr = transferAmountRaw.replace('%', '');
            const percentage = parseFloat(percentageStr) / 100;
            // For percentage transfers, we base it on the source stock's amount
            // If source is infinite, use a fixed value instead of percentage
            actualTransferAmount = isFromInfinite ? parseFloat(percentageStr) : fromStock.simulationAmount * percentage;
          } else {
            // Fixed amount transfer - but limit to what was actually deducted
            const requestedTransferAmount = Number(transferAmountRaw);
            if (!isFromInfinite) {
              // For finite sources, transfer amount should not exceed what was actually deducted
              actualTransferAmount = Math.min(requestedTransferAmount, actualDeductAmount);
            } else {
              // For infinite sources, use the full requested transfer amount
              actualTransferAmount = requestedTransferAmount;
            }
          }
        }
        
        // Deduct from source's simulation amount (unless it's infinite)
        if (!isFromInfinite) {
          // Make sure simulation amount is a number
          const currentAmount = typeof fromStock.simulationAmount === 'number' ? 
            fromStock.simulationAmount : parseFloat(fromStock.simulationAmount);
            
          fromStock.simulationAmount = Math.max(0, currentAmount - actualDeductAmount);
            
          console.log(`Deducted ${actualDeductAmount} from ${fromStock.name}, new amount: ${fromStock.simulationAmount}`);
        }
        
        // Add to destination's simulation amount (unless it's infinite)
        if (!isToInfinite) {
          // Make sure simulation amount is a number
          const currentAmount = typeof toStock.simulationAmount === 'number' ? 
            toStock.simulationAmount : parseFloat(toStock.simulationAmount);
            
          toStock.simulationAmount = currentAmount + actualTransferAmount;
            
          console.log(`Added ${actualTransferAmount} to ${toStock.name}, new amount: ${toStock.simulationAmount}`);
        }
      }
    });
    
    // Update the JSON data - keep original amount unchanged, but include simulation amount for display
    const updatedJsonData = {
      ...jsonData,
      boxes: updatedBoxes.map(box => {
        // Ensure we maintain all the box properties, with updated simulation values
        const updatedBox = {
          ...box,
          // Keep the original amount unchanged
          amount: box.amount,
          // Make sure simulationAmount is always included
          simulationAmount: box.simulationAmount
        };
        
        console.log(`Updated box ${box.name} after simulation:`, {
          id: updatedBox.id,
          amount: updatedBox.amount,
          simulationAmount: updatedBox.simulationAmount
        });
        
        return updatedBox;
      })
    };
    
    // Update the UI with the simulation results
    console.log("Setting JSON data with simulation results:", updatedJsonData);
    setJsonData(updatedJsonData);
    // Don't update the editor value to avoid overwriting the original model
    // setEditorValue(JSON.stringify(updatedJsonData, null, 2));
    
    // Increment simulation step counter
    setSimulationSteps(prev => prev + 1);
    
    // Remove the refreshBoxes call - not needed anymore
    // refreshBoxes(updatedJsonData); // REMOVED
  };

  const runMultipleSteps = () => {
    for (let i = 0; i < targetSteps; i++) {
      runSimulation();
    }
  };

  const resetSimulation = () => {
    // Reset simulation step counter
    setSimulationSteps(0);
    
    // Reset simulation amounts to original amounts
    if (jsonData && jsonData.boxes) {
      const resetBoxes = jsonData.boxes.map(box => {
        // Reset simulationAmount to match the original amount
        return {
          ...box,
          simulationAmount: box.amount
        };
      });
      
      const resetJsonData = {
        ...jsonData,
        boxes: resetBoxes
      };
      
      // Update the UI with reset data
      setJsonData(resetJsonData);
      // Don't update the editor to preserve the original model
      // setEditorValue(JSON.stringify(resetJsonData, null, 2));
      
      // Remove this line:
      // refreshBoxes(resetJsonData); // REMOVED
    }
  };

  const refreshBoxes = (updatedJsonData) => {
    // Remove existing boxes
    paperState.current.boxes.forEach(box => box.remove());
    const newBoxes = [];
    
    // Recreate boxes with updated data
    if (updatedJsonData.boxes) {
      updatedJsonData.boxes.forEach(boxData => {
        console.log("Rendering box:", boxData.name, "with data:", {
          id: boxData.id,
          amount: boxData.amount,
          simulationAmount: boxData.simulationAmount,
          shape: boxData.shape
        });
        
        // Create text label first to measure its size
        let displayAmount, textContent;
        
        // Special case for infinite stocks (circles)
        if (boxData.shape === 'circle') {
          displayAmount = '∞';
          textContent = `${boxData.name}\n${displayAmount}`;
          console.log(`Box ${boxData.name} showing infinite amount: ${displayAmount}`);
        } 
        // For regular stocks in simulation mode
        else if (boxData.simulationAmount !== undefined) {
          // Format simulation amount with 2 decimal places
          const simAmount = typeof boxData.simulationAmount === 'number' ? 
            boxData.simulationAmount.toFixed(1) : boxData.simulationAmount;
            
          // Use amount as the original value
          const origAmount = boxData.amount;
            
          textContent = `${boxData.name}\n${simAmount} / ${origAmount}`;
          console.log(`Box ${boxData.name} showing simulation: ${simAmount} / ${origAmount}`);
        } 
        // For regular stocks without simulation
        else {
          displayAmount = boxData.amount;
          textContent = `${boxData.name}\n${displayAmount}`;
          console.log(`Box ${boxData.name} showing regular amount: ${displayAmount}`);
        }
        // Use a different text color for boxes in simulation mode
        const hasSimulation = boxData.simulationAmount !== undefined;
        const textColor = hasSimulation && boxData.simulationAmount !== boxData.amount ? 
            '#FF6600' : 'black';
        const fontWeight = hasSimulation && boxData.simulationAmount !== boxData.amount ? 
            'bold' : 'normal';
            
        const textLabel = new paper.PointText({
          point: [boxData.position?.x || 0, boxData.position?.y || 0],
          content: textContent,
          fillColor: textColor,
          fontSize: 12,
          fontWeight: fontWeight,
          justification: 'center'
        });
        
        // Measure text dimensions and add padding
        const textBounds = textLabel.bounds;
        const paddingX = 40; // Increased horizontal padding
        const paddingY = 30; // Increased vertical padding
        
        // Create stock box based on text size
        const posX = boxData.position?.x || 0;
        const posY = boxData.position?.y || 0;
        
        // Apply different styling for stocks in simulation mode
        const isInSimulation = hasSimulation && boxData.simulationAmount !== boxData.amount;
        const circleFillColor = isInSimulation ? '#B5EDA0' : '#90EE90';  // Slightly different green for simulation
        const rectFillColor = isInSimulation ? '#C2E2F2' : '#ADD8E6';   // Slightly different blue for simulation
        const strokeColor = isInSimulation ? '#FF6600' : 'black';       // Orange border for simulation
        const strokeWidth = isInSimulation ? 3 : 2;                     // Thicker border for simulation
        
        const stockBox = boxData.shape === 'circle' ? 
          new paper.Path.Circle({
            center: [posX, posY],
            radius: Math.max(40, Math.max(textBounds.width/2 + paddingX/2, textBounds.height/2 + paddingY/2)),
            fillColor: circleFillColor,
            strokeColor: strokeColor,
            strokeWidth: strokeWidth
          }) :
          new paper.Path.Rectangle({
            point: [posX - textBounds.width/2 - paddingX, posY - textBounds.height/2 - paddingY],
            size: [textBounds.width + paddingX*2, textBounds.height + paddingY*2],
            fillColor: rectFillColor,
            strokeColor: strokeColor,
            strokeWidth: strokeWidth
          });
        
        // Adjust text position to center it properly
        textLabel.position = new paper.Point(posX, posY);
        
        const stockGroup = new paper.Group([stockBox, textLabel]);
        stockGroup.stockId = boxData.id;
        stockGroup.stockName = boxData.name;
        stockGroup.position = new paper.Point(posX, posY);
        
        // Add click handlers for interactivity
        stockGroup.onMouseDown = (event) => {
          if (currentMode === 'connect') {
            if (!connectionStart) {
              setConnectionStart(boxData.id);
            } else if (connectionStart !== boxData.id) {
              createNewConnection(connectionStart, boxData.id);
              setConnectionStart(null);
            }
          } else if (currentMode === 'edit') {
            setSelectedItem({ ...boxData, type: 'stock' });
            setEditingItem({ ...boxData, type: 'stock' });
            setSelectedBoxId(boxData.id);
          }
        };
        
        newBoxes.push(stockGroup);
      });
    }
    
    paperState.current.boxes = newBoxes;
    
    // Refresh connections after updating boxes
    refreshConnections(updatedJsonData);
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
      
      // Check if this is a self-connection
      if (connData.fromStockId === connData.toStockId) {
        // Only update self-connection if the dragged box is the same as the self-connection's box
        if (draggedBox.stockId !== connData.fromStockId) {
          return; // Skip updating this self-connection if it's not the dragged box
        }
        
        // For self-connections, update the position but keep the same relative structure
        const boxBounds = fromBox.bounds;
        const boxCenter = fromBox.position;
        const loopRadius = 150;
        
        // Update the self-connection position
        const startPoint = new paper.Point(boxBounds.right, boxCenter.y);
        const endPoint = new paper.Point(boxBounds.right, boxCenter.y - 5);
        const controlOffset = loopRadius;
        const control1 = new paper.Point(boxBounds.right + controlOffset, boxCenter.y - controlOffset);
        const control2 = new paper.Point(boxBounds.right + controlOffset, boxCenter.y + controlOffset);
        
        const path = connection.children[0];
        if (path && path.segments) {
          path.segments[0].point = startPoint;
          path.segments[1].point = endPoint;
          path.segments[0].handleOut = control1.subtract(startPoint);
          path.segments[1].handleIn = control2.subtract(endPoint);
        }
        
        // Update arrow position for self-connection
        const arrowHead = connection.children[1];
        if (arrowHead && arrowHead.segments) {
          const arrowSize = 8;
          const arrowDirection = new paper.Point(-1, 0);
          const perpendicular = new paper.Point(0, -1);
          const arrowTip = endPoint;
          const arrowBase = arrowTip.subtract(arrowDirection.multiply(arrowSize));
          const arrowLeft = arrowBase.add(perpendicular.multiply(arrowSize/2));
          const arrowRight = arrowBase.subtract(perpendicular.multiply(arrowSize/2));
          
          arrowHead.segments[0].point = arrowTip;
          arrowHead.segments[1].point = arrowLeft;
          arrowHead.segments[2].point = arrowRight;
        }
        
        // Update name label position if it exists
        if (connection.children[2]) {
          const labelPosition = new paper.Point(boxBounds.right + loopRadius, boxCenter.y);
          connection.children[2].position = labelPosition;
        }
        
        return; // Skip regular connection logic for self-connections
      }
      

      
      // Ensure direction is consistent with connection data: from -> to
      const end = getEdgePoint(fromBox, toBox);
      const start = getEdgePoint(toBox, fromBox);
      const arrowSize = 8;
      // Calculate direction and snap to nearest axis (horizontal or vertical only)
      const rawDirection = end.subtract(start);
      
      let direction;
      if (Math.abs(rawDirection.x) > Math.abs(rawDirection.y)) {
        // Horizontal direction
        direction = new paper.Point(rawDirection.x > 0 ? 1 : -1, 0);
      } else {
        // Vertical direction
        direction = new paper.Point(0, rawDirection.y > 0 ? 1 : -1);
      }
      const perpendicular = new paper.Point(-direction.y, direction.x);
      const arrowBase = end.subtract(direction.multiply(arrowSize));
      // Ensure arrow points in correct direction: from -> to
      const arrowLeft = arrowBase.add(perpendicular.multiply(arrowSize/2));
      const arrowRight = arrowBase.subtract(perpendicular.multiply(arrowSize/2));
      // The curve should end at the base of the arrow, not the box
      // Handle calculations should follow the arrow direction
      let handle1, handle2;
      if (Math.abs(direction.x) > 0) {
        // Horizontal arrow - curve should be vertical
        handle1 = new paper.Point((start.x + arrowBase.x) / 2, start.y);
        handle2 = new paper.Point((start.x + arrowBase.x) / 2, arrowBase.y);
      } else {
        // Vertical arrow - curve should be horizontal
        handle1 = new paper.Point(start.x, (start.y + arrowBase.y) / 2);
        handle2 = new paper.Point(arrowBase.x, (start.y + arrowBase.y) / 2);
      }
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
    if (paper.view) paper.view.draw();
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
        width: toolboxCollapsed ? '40px' : '300px',
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
                : selectedItem
                  ? <span style={{ color: '#ff6600', fontWeight: 'bold' }}>Selected: {selectedItem.name}</span>
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
              if (e.target.value !== 'edit') {
                setSelectedItem(null);
                setEditingItem(null);
                setSelectedBoxId(null);
              }
            }}
            style={{ marginBottom: '10px', width: '100%' }}
          >
            <option value="normal">Normal</option>
            <option value="add">Add Stock</option>
            <option value="connect">Connect</option>
            <option value="edit">Edit</option>
            <option value="simulate">Simulate</option>
          </select>
          {currentMode === 'add' && (
            <div style={{ marginTop: '10px' }}>
              <select
                value={newStockShape}
                onChange={e => {
                  setNewStockShape(e.target.value);
                  if (e.target.value === 'circle') {
                    setNewStockAmount(0); // Reset amount for infinite stocks
                  }
                }}
                style={{ width: '100%', marginBottom: '6px', padding: '4px' }}
              >
                <option value="rectangle">Rectangle (Finite Stock)</option>
                <option value="circle">Circle (Infinite Stock)</option>
              </select>
              <input
                type="text"
                placeholder="Stock Name"
                value={newStockName}
                onChange={e => setNewStockName(e.target.value)}
                style={{ width: '100%', marginBottom: '6px', padding: '4px' }}
              />
              {newStockShape === 'rectangle' && (
                <input
                  type="number"
                  placeholder="Amount"
                  value={newStockAmount}
                  onChange={e => setNewStockAmount(Number(e.target.value))}
                  style={{ width: '100%', marginBottom: '6px', padding: '4px' }}
                />
              )}
              {newStockShape === 'circle' && (
                <div style={{ padding: '8px', marginBottom: '6px', backgroundColor: '#e8f5e8', borderRadius: '4px', textAlign: 'center', fontSize: '12px' }}>
                  Infinite Stock (∞)
                </div>
              )}
              <button
                style={{ width: '100%', background: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px', padding: '6px', fontWeight: 'bold' }}
                onClick={() => {
                  const isValidFinite = newStockShape === 'rectangle' && newStockName && newStockName.trim() !== '';
                  const isValidInfinite = newStockShape === 'circle' && newStockName && newStockName.trim() !== '';
                  
                  if (isValidFinite || isValidInfinite) {
                    addBoxWithNameAndAmount(newStockName, newStockAmount, newStockShape);
                    setNewStockName('');
                    setNewStockAmount(0);
                    setNewStockShape('rectangle');
                  }
                }}
              >Add Stock</button>
            </div>
          )}
          {currentMode === 'edit' && (
            <div style={{ marginTop: '10px' }}>
              {/* Edit Mode Info */}
              <div style={{ marginBottom: '10px', padding: '8px', backgroundColor: '#f8f9fa', borderRadius: '4px', border: '1px solid #dee2e6' }}>
                <strong>Edit Mode:</strong> Click on a stock or connection to edit it
              </div>
              {selectedItem && selectedItem.type === 'stock' ? (
                <div>
                  <div style={{ marginBottom: '10px', padding: '8px', backgroundColor: '#fff3cd', borderRadius: '4px', border: '1px solid #ffeaa7' }}>
                    <strong>Editing: {selectedItem.name}</strong>
                  </div>
                  <div style={{ marginBottom: '6px' }}>
                    <label style={{ display: 'block', marginBottom: '2px', fontWeight: 'bold', fontSize: '12px' }}>Stock Name:</label>
                    <input
                      type="text"
                      placeholder="Enter stock name"
                      value={editingItem?.name || ''}
                      onChange={e => setEditingItem({...editingItem, name: e.target.value})}
                      style={{ width: '70%', padding: '4px' }}
                    />
                  </div>
                  <div style={{ marginBottom: '6px' }}>
                    <label style={{ display: 'block', marginBottom: '2px', fontWeight: 'bold', fontSize: '12px' }}>Amount:</label>
                    <input
                      type="number"
                      placeholder="Enter amount"
                      value={editingItem?.amount || 0}
                      onChange={e => setEditingItem({...editingItem, amount: Number(e.target.value)})}
                      style={{ width: '70%', padding: '4px' }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '5px', marginBottom: '5px' }}>
                    <button
                      style={{ flex: 1, background: '#007bff', color: 'white', border: 'none', borderRadius: '4px', padding: '6px', fontWeight: 'bold' }}
                      onClick={() => {
                        if (editingItem?.name && editingItem?.name.trim() !== '' && 
                            typeof editingItem?.amount === 'number') {
                          // Update the JSON data
                          const updatedJsonData = {
                            ...jsonData,
                            boxes: jsonData.boxes.map(box => 
                              box.id === selectedItem.id 
                                ? { ...box, name: editingItem.name, amount: editingItem.amount }
                                : box
                            )
                          };
                          setJsonData(updatedJsonData);
                          setEditorValue(JSON.stringify(updatedJsonData, null, 2));
                          // Clear selection after saving
                          setSelectedItem(null);
                          setEditingItem(null);
                          setSelectedBoxId(null);
                        } else {
                          alert('Please enter a valid stock name and amount.');
                        }
                      }}
                    >
                      Save
                    </button>
                    <button
                      style={{ flex: 1, background: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', padding: '6px', fontWeight: 'bold' }}
                      onClick={() => {
                        setSelectedItem(null);
                        setEditingItem(null);
                        setSelectedBoxId(null);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                  <button
                    style={{ width: '100%', background: '#f44336', color: 'white', border: 'none', borderRadius: '4px', padding: '6px', fontWeight: 'bold' }}
                    onClick={() => {
                      if (window.confirm(`Remove stock '${selectedItem.name}' and all its connections?`)) {
                        // Remove the stock and all its connections
                        const updatedJsonData = {
                          ...jsonData,
                          boxes: jsonData.boxes.filter(box => box.id !== selectedItem.id),
                          connections: jsonData.connections.filter(conn => conn.fromStockId !== selectedItem.id && conn.toStockId !== selectedItem.id)
                        };
                        setJsonData(updatedJsonData);
                        setEditorValue(JSON.stringify(updatedJsonData, null, 2));
                        setSelectedItem(null);
                        setEditingItem(null);
                        setSelectedBoxId(null);
                      }
                    }}
                  >
                    Remove Stock
                  </button>
                </div>
              ) : selectedItem && selectedItem.type === 'connection' ? (
                <div>
                  <div style={{ marginBottom: '10px', padding: '8px', backgroundColor: '#e7f3ff', borderRadius: '4px', border: '1px solid #b3d9ff' }}>
                    <strong>Editing Connection: {selectedItem.name}</strong>
                  </div>
                  <div style={{ marginBottom: '6px' }}>
                    <label style={{ display: 'block', marginBottom: '2px', fontWeight: 'bold', fontSize: '12px' }}>Connection Name:</label>
                    <input
                      type="text"
                      placeholder="Enter connection name"
                      value={editingItem?.name || ''}
                      onChange={e => setEditingItem({...editingItem, name: e.target.value})}
                      style={{ width: '70%', padding: '4px' }}
                    />
                  </div>
                  <div style={{ marginBottom: '6px' }}>
                    <label style={{ display: 'block', marginBottom: '2px', fontWeight: 'bold', fontSize: '12px' }}>Deduct Amount:</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <input
                        type="number"
                        placeholder="Amount to deduct from source"
                        value={typeof editingItem?.deductAmount === 'string' && editingItem.deductAmount.includes('%') 
                          ? editingItem.deductAmount.replace('%', '') 
                          : editingItem?.deductAmount ?? 1}
                        onChange={e => {
                          const value = e.target.value;
                          const isPercent = document.getElementById('deduct-percent-checkbox').checked;
                          setEditingItem({
                            ...editingItem, 
                            deductAmount: isPercent ? `${value}%` : Number(value)
                          });
                        }}
                        style={{ width: '60%', padding: '4px' }}
                        min="0"
                        step="0.1"
                      />
                      <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                        <input
                          id="deduct-percent-checkbox"
                          type="checkbox"
                          checked={typeof editingItem?.deductAmount === 'string' && editingItem.deductAmount.includes('%')}
                          onChange={e => {
                            const isPercent = e.target.checked;
                            const currentValue = typeof editingItem?.deductAmount === 'string' && editingItem.deductAmount.includes('%')
                              ? parseFloat(editingItem.deductAmount.replace('%', ''))
                              : (editingItem?.deductAmount ?? 1);
                            setEditingItem({
                              ...editingItem,
                              deductAmount: isPercent ? `${currentValue}%` : Number(currentValue)
                            });
                          }}
                        />
                        <label htmlFor="deduct-percent-checkbox" style={{ fontSize: '12px' }}>%</label>
                      </div>
                    </div>
                  </div>
                  <div style={{ marginBottom: '6px' }}>
                    <label style={{ display: 'block', marginBottom: '2px', fontWeight: 'bold', fontSize: '12px' }}>Transfer Amount:</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <input
                        type="number"
                        placeholder="Amount to add to destination"
                        value={typeof editingItem?.transferAmount === 'string' && editingItem.transferAmount.includes('%') 
                          ? editingItem.transferAmount.replace('%', '') 
                          : editingItem?.transferAmount ?? 1}
                        onChange={e => {
                          const value = e.target.value;
                          const isPercent = document.getElementById('transfer-percent-checkbox').checked;
                          setEditingItem({
                            ...editingItem, 
                            transferAmount: isPercent ? `${value}%` : Number(value)
                          });
                        }}
                        style={{ width: '60%', padding: '4px' }}
                        min="0"
                        step="0.1"
                      />
                      <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                        <input
                          id="transfer-percent-checkbox"
                          type="checkbox"
                          checked={typeof editingItem?.transferAmount === 'string' && editingItem.transferAmount.includes('%')}
                          onChange={e => {
                            const isPercent = e.target.checked;
                            const currentValue = typeof editingItem?.transferAmount === 'string' && editingItem.transferAmount.includes('%')
                              ? parseFloat(editingItem.transferAmount.replace('%', ''))
                              : (editingItem?.transferAmount ?? 1);
                            setEditingItem({
                              ...editingItem,
                              transferAmount: isPercent ? `${currentValue}%` : Number(currentValue)
                            });
                          }}
                        />
                        <label htmlFor="transfer-percent-checkbox" style={{ fontSize: '12px' }}>%</label>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '5px', marginBottom: '5px' }}>
                    <button
                      style={{ flex: 1, background: '#007bff', color: 'white', border: 'none', borderRadius: '4px', padding: '6px', fontWeight: 'bold' }}
                      onClick={() => {
                        console.log("Connection Save button clicked");
                        console.log("editingItem:", editingItem);
                        console.log("selectedItem:", selectedItem);
                        console.log("jsonData.connections:", jsonData.connections);
                        
                        // Safeguard: ensure editingItem has the right properties with valid values
                        // Now supporting both numeric values and percentage strings
                        const safeEditingItem = {
                          ...editingItem,
                          name: editingItem?.name || "Unnamed Connection",
                          deductAmount: editingItem?.deductAmount !== undefined && editingItem?.deductAmount !== null && editingItem?.deductAmount !== '' ? 
                            editingItem.deductAmount : 1,
                          transferAmount: editingItem?.transferAmount !== undefined && editingItem?.transferAmount !== null && editingItem?.transferAmount !== '' ? 
                            editingItem.transferAmount : 1
                        };
                        console.log("Safe editing item with defaults:", safeEditingItem);
                        
                        // Validate deduct amount (can be number or percentage string)
                        const isValidDeductAmount = typeof safeEditingItem.deductAmount === 'number' ? 
                          safeEditingItem.deductAmount >= 0 : 
                          typeof safeEditingItem.deductAmount === 'string' && 
                          safeEditingItem.deductAmount.includes('%') && 
                          parseFloat(safeEditingItem.deductAmount) >= 0;
                          
                        // Validate transfer amount (can be number or percentage string)
                        const isValidTransferAmount = typeof safeEditingItem.transferAmount === 'number' ? 
                          safeEditingItem.transferAmount >= 0 : 
                          typeof safeEditingItem.transferAmount === 'string' && 
                          safeEditingItem.transferAmount.includes('%') && 
                          parseFloat(safeEditingItem.transferAmount) >= 0;
                        
                        if (safeEditingItem.name && safeEditingItem.name.trim() !== '' && 
                            isValidDeductAmount && isValidTransferAmount) {
                          console.log("Connection validation passed, saving changes...");
                          
                          // Update the JSON data using the safe values we created
                          const updatedJsonData = {
                            ...jsonData,
                            connections: jsonData.connections.map(conn => {
                              console.log("Comparing connection ID:", conn.id, "with selected ID:", selectedItem.id);
                              if (conn.id === selectedItem.id) {
                                console.log("Found matching connection to update");
                                return { 
                                  ...conn, 
                                  name: safeEditingItem.name, 
                                  deductAmount: safeEditingItem.deductAmount, 
                                  transferAmount: safeEditingItem.transferAmount 
                                };
                              }
                              return conn;
                            })
                          };
                          
                          console.log("Updated JSON data:", updatedJsonData);
                          
                          // First update the selected item to show changes immediately in the UI
                          setSelectedItem({ 
                            ...selectedItem, 
                            name: safeEditingItem.name, 
                            deductAmount: safeEditingItem.deductAmount, 
                            transferAmount: safeEditingItem.transferAmount 
                          });
                          
                          // Update the editing item as well with the safe values
                          setEditingItem({ 
                            ...editingItem, 
                            name: safeEditingItem.name, 
                            deductAmount: safeEditingItem.deductAmount, 
                            transferAmount: safeEditingItem.transferAmount 
                          });
                          
                          // Then update the JSON data which will trigger both refreshes
                          setJsonData(updatedJsonData);
                          
                          // Manually trigger the editor update for immediate feedback
                          setEditorValue(JSON.stringify(updatedJsonData, null, 2));
                          
                          // Immediately update the connection label to reflect the new values
                          console.log("Refreshing connections to update visuals");
                          refreshConnections(updatedJsonData);
                          
                          // Clear selection after saving
                          setSelectedItem(null);
                          console.log("Connection saved successfully");
                        } else {
                          console.error("Validation failed:", {
                            name: safeEditingItem.name,
                            deductAmount: safeEditingItem.deductAmount,
                            transferAmount: safeEditingItem.transferAmount
                          });
                          alert('Please fill in all fields with valid values before saving. Values must be valid numbers.');
                        }
                      }}
                    >
                      Save
                    </button>
                    <button
                      style={{ flex: 1, background: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', padding: '6px', fontWeight: 'bold' }}
                      onClick={() => {
                        setSelectedItem(null);
                        setEditingItem(null);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                  <button
                    style={{ width: '100%', background: '#f44336', color: 'white', border: 'none', borderRadius: '4px', padding: '6px', fontWeight: 'bold' }}
                    onClick={() => {
                      if (window.confirm(`Remove connection '${selectedItem.name}'?`)) {
                        // Remove the connection
                        const updatedJsonData = {
                          ...jsonData,
                          connections: jsonData.connections.filter(conn => conn.id !== selectedItem.id)
                        };
                        setJsonData(updatedJsonData);
                        setEditorValue(JSON.stringify(updatedJsonData, null, 2));
                        setSelectedItem(null);
                        setEditingItem(null);
                        // Refresh visual connections to remove the deleted connection
                        refreshConnections(updatedJsonData);
                      }
                    }}
                  >
                    Remove Connection
                  </button>
                </div>
              ) : (
                <div style={{ padding: '10px', textAlign: 'center', color: '#6c757d' }}>
                  Click on a connection to edit it
                </div>
              )}
            </div>
          )}
          {currentMode === 'simulate' && (
            <div style={{ marginTop: '10px' }}>
              <div style={{ marginBottom: '10px', padding: '8px', backgroundColor: '#f0f8ff', borderRadius: '4px', border: '1px solid #b3d9ff' }}>
                <strong>Simulation Mode</strong>
              </div>
              
              {/* Step Counter Display */}
              <div style={{ marginBottom: '10px', padding: '8px', backgroundColor: '#e8f5e8', borderRadius: '4px', border: '1px solid #c3e6c3', textAlign: 'center' }}>
                <strong>Steps Completed: {simulationSteps}</strong>
              </div>
              
              {/* Target Steps Input */}
              <div style={{ marginBottom: '10px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold', fontSize: '12px' }}>Target Steps:</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={targetSteps}
                  onChange={e => setTargetSteps(Math.max(1, Math.min(100, Number(e.target.value))))}
                  style={{ width: '100%', padding: '4px', marginBottom: '6px' }}
                />
              </div>
              
              {/* Simulation Buttons */}
              <div style={{ display: 'flex', gap: '5px', marginBottom: '10px' }}>
                <button
                  style={{ flex: 1, background: '#28a745', color: 'white', border: 'none', borderRadius: '4px', padding: '8px', fontWeight: 'bold', fontSize: '12px' }}
                  onClick={() => {
                    runSimulation();
                  }}
                >
                  Run 1 Step
                </button>
                <button
                  style={{ flex: 1, background: '#007bff', color: 'white', border: 'none', borderRadius: '4px', padding: '8px', fontWeight: 'bold', fontSize: '12px' }}
                  onClick={() => {
                    runMultipleSteps();
                  }}
                >
                  Run {targetSteps} Steps
                </button>
              </div>
              
              <button
                style={{ width: '100%', background: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', padding: '8px', fontWeight: 'bold', fontSize: '12px' }}
                onClick={() => {
                  resetSimulation();
                }}
              >
                Reset Counter
              </button>
              
              <div style={{ fontSize: '11px', color: '#6c757d', textAlign: 'center', marginTop: '8px' }}>
                Set target steps (1-100) and run simulation
              </div>
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
          background-color: #e0e0e0;
          border: 1px solid #ccc;
          transition: all 0.2s ease;
        }
        .SplitPane .Resizer:hover,
        .Resizer:hover,
        .SplitPane-resizer:hover {
          cursor: col-resize !important;
          background-color: #007acc;
          border-color: #005a9e;
        }
        .SplitPane .Resizer:active,
        .Resizer:active,
        .SplitPane-resizer:active {
          cursor: col-resize !important;
          background-color: #005a9e;
          border-color: #004080;
        }
        .SplitPane .Resizer[style*="pointer-events: none"],
        .Resizer[style*="pointer-events: none"],
        .SplitPane-resizer[style*="pointer-events: none"] {
          pointer-events: auto !important;
        }
        .stock-placement-cursor {
          cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Crect x='4' y='4' width='24' height='24' rx='2' ry='2' fill='%234CAF50' fill-opacity='0.7' stroke='%23333' stroke-width='2'/%3E%3Ctext x='16' y='20' font-family='Arial' font-size='12' text-anchor='middle' fill='white'%3ES%3C/text%3E%3C/svg%3E") 16 16, crosshair;
        }
      `}</style>
      <SplitPane
        split="vertical"
        minSize={200}
        size={jsonEditorVisible ? splitSize : '100vw'}
        onChange={size => setSplitSize(size)}
        style={{ position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh' }}
      >
        {/* Canvas pane */}
        <div style={{ width: '100%', height: '100%', position: 'relative' }}>
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
                  if (paper.view) paper.view.draw();
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
                  setSelectedItem(null);
                  setEditingItem(null);
                }
              }
            }}
          />
          {renderToolbox()}
        </div>
        {/* Editor pane */}
        {jsonEditorVisible ? (
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#fff', zIndex: 2 }}>
            <Editor
              height="100%"
              language="json"
              value={editorValue}
              onChange={(value) => {
                setEditorValue(value);
                try {
                  const parsedValue = JSON.parse(value);
                  
                  // Ensure connections have deductAmount and transferAmount properties
                  if (parsedValue.connections) {
                    parsedValue.connections = parsedValue.connections.map(conn => {
                      // Preserve string format for percentage values
                      let deductAmount = conn.deductAmount !== undefined ? conn.deductAmount : 1;
                      let transferAmount = conn.transferAmount !== undefined ? conn.transferAmount : 1;
                      
                      // If the value is a string and contains '%', keep it as a string
                      // Otherwise, ensure it's a number
                      if (typeof deductAmount === 'string') {
                        if (!deductAmount.includes('%')) {
                          deductAmount = Number(deductAmount);
                        }
                      } else if (typeof deductAmount === 'number') {
                        // Already a number, no conversion needed
                      } else if (deductAmount !== undefined) {
                        // Convert other types to number
                        deductAmount = Number(deductAmount);
                      }
                      
                      if (typeof transferAmount === 'string') {
                        if (!transferAmount.includes('%')) {
                          transferAmount = Number(transferAmount);
                        }
                      } else if (typeof transferAmount === 'number') {
                        // Already a number, no conversion needed
                      } else if (transferAmount !== undefined) {
                        // Convert other types to number
                        transferAmount = Number(transferAmount);
                      }
                      
                      return {
                        ...conn,
                        deductAmount: deductAmount,
                        transferAmount: transferAmount
                      };
                    });
                  }
                  
                  const dataWithSimulation = ensureSimulationAmount(parsedValue);
                  setJsonData(dataWithSimulation);
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
        ) : <div />}
      </SplitPane>
      {/* JSON Editor Toggle Button - Positioned at bottom */}
      <button
        onClick={() => {
          if (jsonEditorVisible) {
            setSplitSize('100vw');
          } else {
            setSplitSize(window.innerWidth * 0.75);
          }
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
      
      {/* Canvas Selection Dropdown */}
      <div style={{
        position: 'fixed',
        bottom: '20px',
        left: '20px',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        gap: '10px'
      }}>
        <label style={{
          color: '#333',
          fontSize: '14px',
          fontWeight: 'bold'
        }}>Canvas:</label>
        <select
          value={currentCanvasName}
          onChange={(e) => handleCanvasSelection(e.target.value)}
          style={{
            padding: '8px 12px',
            fontSize: '14px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            backgroundColor: 'white',
            cursor: 'pointer',
            minWidth: '150px'
          }}
        >
          {availableCanvases.map(name => (
            <option key={name} value={name}>{name}</option>
          ))}
          <option value="new_canvas">+ New Canvas</option>
        </select>
        <button
          onClick={() => saveCurrentCanvas()}
          style={{
            padding: '8px 12px',
            backgroundColor: '#2196F3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 'bold'
          }}
          title="Save current canvas"
        >
          💾 Save
        </button>
      </div>
      
      {/* New Canvas Dialog */}
      {showNewCanvasDialog && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '8px',
            boxShadow: '0 4px 8px rgba(0,0,0,0.3)',
            minWidth: '300px'
          }}>
            <h3 style={{ margin: '0 0 15px 0' }}>Create New Canvas</h3>
            <input
              type="text"
              placeholder="Enter canvas name"
              value={newCanvasName}
              onChange={(e) => setNewCanvasName(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  createNewCanvas(newCanvasName);
                }
              }}
              style={{
                width: '100%',
                padding: '10px',
                fontSize: '14px',
                border: '1px solid #ccc',
                borderRadius: '4px',
                marginBottom: '15px',
                boxSizing: 'border-box'
              }}
              autoFocus
            />
            <div style={{
              display: 'flex',
              gap: '10px',
              justifyContent: 'flex-end'
            }}>
              <button
                onClick={() => {
                  setShowNewCanvasDialog(false);
                  setNewCanvasName('');
                }}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#ccc',
                  color: '#333',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => createNewCanvas(newCanvasName)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#4CAF50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaperCanvas;