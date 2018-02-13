<!DOCTYPE html>
<html lang="en">
<?php include_once "include/header.php"; ?>
<body>

<header>
	<div class="container-fluid">
		<a href="connection-settings.php" class="settings"><i class="fas fa-cog"></i></a>
	</div>	
</header>
<div class="container">
<h2 class="main-title">Connection settings</h2>
<table class="table table-bordered" id="table"        
    data-toggle="table"
    data-filter-control="true" 
    data-click-to-select="true"
    data-height="300">
  <thead>
    <tr>
      <th data-field="server" data-filter-control="input" data-sortable="true">Server</th>
      <th data-field="user" data-filter-control="input" data-sortable="true">User</th>
      <th data-field="actions" data-escape="false" >Actions</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>xw2017-01xnat.org</td>
      <td>Will1</td>
      <td class="action"><a href="#" class="edit"><i class="fas fa-edit"></i></a><a href="#" class="trash"><i class="fas fa-trash-alt"></i></a></td>
    </tr>
    <tr>
      <td>xw2017-02xnat.org</td>
      <td>Will3</td>
     <td class="action"><a href="#" class="edit"><i class="fas fa-edit"></i></a><a href="#" class="trash"><i class="fas fa-trash-alt"></i></a></td>
    </tr>
    <tr>
      <td>xw2017-03xnat.org</td>
      <td>Will2</td>
      <td class="action"><a href="#" class="edit"><i class="fas fa-edit"></i></a><a href="#" class="trash"><i class="fas fa-trash-alt"></i></a></td>
    </tr>
     <tr>
      <td>xw2017-04xnat.org</td>
      <td>Will1</td>
      <td class="action"><a href="#" class="edit"><i class="fas fa-edit"></i></a><a href="#" class="trash"><i class="fas fa-trash-alt"></i></a></td>
    </tr>
    <tr>
      <td>xw2017-05xnat.org</td>
      <td>Will3</td>
     <td class="action"><a href="#" class="edit"><i class="fas fa-edit"></i></a><a href="#" class="trash"><i class="fas fa-trash-alt"></i></a></td>
    </tr>
    <tr>
      <td>xw2017-06xnat.org</td>
      <td>Will2</td>
      <td class="action"><a href="#" class="edit"><i class="fas fa-edit"></i></a><a href="#" class="trash"><i class="fas fa-trash-alt"></i></a></td>
    </tr>
     <tr>
      <td>xw2017-07xnat.org</td>
      <td>Will1</td>
      <td class="action"><a href="#" class="edit"><i class="fas fa-edit"></i></a><a href="#" class="trash"><i class="fas fa-trash-alt"></i></a></td>
    </tr>
    <tr>
      <td>xw2017-08xnat.org</td>
      <td>Will3</td>
     <td class="action"><a href="#" class="edit"><i class="fas fa-edit"></i></a><a href="#" class="trash"><i class="fas fa-trash-alt"></i></a></td>
    </tr>
    <tr>
      <td>xw2017-09xnat.org</td>
      <td>Will2</td>
      <td class="action"><a href="#" class="edit"><i class="fas fa-edit"></i></a><a href="#" class="trash"><i class="fas fa-trash-alt"></i></a></td>
    </tr>
  </tbody>
</table>

<div class="col-12 text-center">
<button class="connect btn btn-bigfriendly settings-small" type="button" data-toggle="modal" data-target="#new-connection"><span class="plus"></span><span class="db"></span> ADD NEW XNAT SERVER</button>
</div>
</div>
<!-- Modal -->
<div class="modal fade" id="new-connection" tabindex="-1" role="dialog" aria-labelledby="loginTitle" aria-hidden="true">
  <div class="modal-dialog modal-dialog-centered modal-lg" role="document">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title" id="exampleModalLongTitle">Add new connection</h5>
        </button>
      </div>
      <div class="modal-body">
         <form>
          <div class="form-group">
            <label for="server-name" class="col-form-label">Server:</label>
            <input type="text" class="form-control" id="server-name">
          </div>
          <div class="form-group">
            <label for="user-name" class="col-form-label">Username:</label>
            <input type="text" class="form-control" id="user-name">
          </div>
          <div class="form-group">
            <label for="password" class="col-form-label">Password:</label>
            <input type="password" class="form-control" id="password">
          </div>
        </form>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-gray" data-dismiss="modal">Cancel</button>
        <button type="button" class="btn btn-blue">Verify and Save connection</button>
      </div>
    </div>
  </div>
</div>

<?php include_once "include/footer.php"; ?>